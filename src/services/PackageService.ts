import archiver from "archiver";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import YAML from "yaml";
import { AgentManifestSchema, type AgentManifest } from "./AgentManifest.js";
import { KilnError } from "../utils/errors.js";
import type { PackageDetails } from "../types.js";
import { getSkillTemplates } from "./SkillTemplates.js";

const PACKAGE_EXTENSION = ".agent";
const REQUIRED_DIRECTORIES = ["prompts", "workflows", "src"];
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist"]);

export class PackageService {
  public async inspect(source: string): Promise<AgentManifest> {
    const path = resolve(source);
    if (extname(path) !== PACKAGE_EXTENSION) return this.validateProject(path);
    const staging = await mkdtemp(join(tmpdir(), "kiln-inspect-"));
    try { await this.extractArchive(path, staging); return await this.validateProject(staging); }
    finally { await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }

  public async inspectDetails(source: string): Promise<PackageDetails> {
    const path = resolve(source); const sourceStat = await stat(path);
    if (extname(path) !== PACKAGE_EXTENSION) return { manifest: await this.validateProject(path), files: await this.listFiles(path), size: await this.directorySize(path), createdTime: sourceStat.birthtime };
    const staging = await mkdtemp(join(tmpdir(), "kiln-inspect-"));
    try { await this.extractArchive(path, staging); return { manifest: await this.validateProject(staging), files: await this.listFiles(staging), size: sourceStat.size, createdTime: sourceStat.birthtime }; }
    finally { await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }

  public async unpack(archivePath: string, destination: string): Promise<AgentManifest> {
    const target = resolve(destination);
    await mkdir(target, { recursive: true });
    await this.extractArchive(archivePath, target);
    return this.validateProject(target);
  }

  public async lint(projectDirectory = process.cwd()): Promise<{ errors: string[]; warnings: string[]; score: number }> {
    const errors: string[] = []; const warnings: string[] = []; let manifest: AgentManifest | undefined;
    try { manifest = await this.validateProject(projectDirectory); } catch (error) { errors.push(error instanceof Error ? error.message : "Package validation failed."); }
    if (manifest) {
      if (!manifest.author) warnings.push("Manifest does not declare an author.");
      if (!manifest.license) warnings.push("Manifest does not declare a license.");
      if (manifest.description.length < 30) warnings.push("Description is brief; use at least 30 characters for clearer discovery.");
      for (const directory of ["prompts", "workflows"]) if ((await readdir(join(resolve(projectDirectory), directory))).filter((file) => file !== ".gitkeep").length === 0) warnings.push(`${directory}/ has no package content.`);
    }
    return { errors, warnings, score: Math.max(0, 100 - errors.length * 50 - warnings.length * 10) };
  }
  public async validateProject(projectDirectory = process.cwd()): Promise<AgentManifest> {
    const root = resolve(projectDirectory);
    const manifestPath = join(root, "agent.yaml");
    let raw: string;
    try { raw = await readFile(manifestPath, "utf8"); }
    catch (error) { throw new KilnError(`Missing required manifest: ${manifestPath}`, error); }
    let parsed: unknown;
    try { parsed = YAML.parse(raw); } catch (error) { throw new KilnError("agent.yaml contains invalid YAML.", error); }
    const validation = AgentManifestSchema.safeParse(parsed);
    if (!validation.success) throw new KilnError(`Invalid agent.yaml: ${validation.error.issues.map((i) => `${i.path.join(".") || "manifest"} ${i.message}`).join("; ")}`);
    for (const directory of REQUIRED_DIRECTORIES) {
      try { if (!(await stat(join(root, directory))).isDirectory()) throw new Error(); }
      catch { throw new KilnError(`Missing required directory: ${directory}/`); }
    }
    try { await access(join(root, "README.md")); } catch { throw new KilnError("Missing required file: README.md"); }
    return validation.data;
  }

  public async createPackage(projectDirectory = process.cwd(), destinationDirectory = projectDirectory): Promise<string> {
    const root = resolve(projectDirectory); const manifest = await this.validateProject(root);
    const outputPath = join(resolve(destinationDirectory), `${manifest.name}-${manifest.version}${PACKAGE_EXTENSION}`);
    const rootFiles = await Promise.all(["agent.yaml", "README.md", "LICENSE", ".gitignore"].map(async (file) => { try { await access(join(root, file)); return file; } catch { return undefined; } }));
    const hasAssets = await access(join(root, "assets")).then(() => true).catch(() => false);
    await new Promise<void>((resolvePromise, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } }); const stream = createWriteStream(outputPath);
      stream.on("close", resolvePromise); stream.on("error", reject); archive.on("error", reject);
      archive.pipe(stream);
      for (const file of rootFiles) if (file) archive.file(join(root, file), { name: file });
      for (const directory of REQUIRED_DIRECTORIES) {
        archive.append("", { name: `${directory}/` });
        archive.directory(join(root, directory), directory);
      }
      if (hasAssets) archive.directory(join(root, "assets"), "assets");
      archive.finalize();
    });
    return outputPath;
  }

  /** Installs an archive source. Future remote downloads can save to a temp path and use this same method. */
  public async installArchive(archivePath: string, agentsDirectory: string): Promise<{ manifest: AgentManifest; directory: string }> {
    const source = resolve(archivePath);
    if (extname(source) !== PACKAGE_EXTENSION) throw new KilnError(`Expected a ${PACKAGE_EXTENSION} package.`);
    try { await access(source); } catch { throw new KilnError(`Package not found: ${source}`); }
    const staging = await mkdtemp(join(tmpdir(), "kiln-"));
    try {
      await this.extractArchive(source, staging);
      const manifest = await this.validateProject(staging);
      const target = join(agentsDirectory, manifest.name);
      await rm(target, { recursive: true, force: true }); await cp(staging, target, { recursive: true, filter: (from) => !IGNORED_DIRECTORIES.has(basename(from)) });
      return { manifest, directory: target };
    } catch (error) { if (error instanceof KilnError) throw error; throw new KilnError("Unable to install package. The archive may be corrupt.", error); }
    finally { await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }

  public async scaffold(projectDirectory = process.cwd()): Promise<AgentManifest> {
    const root = resolve(projectDirectory); await mkdir(root, { recursive: true }); const entries = await readdir(root);
    if (entries.length) throw new KilnError("Refusing to initialize a non-empty directory.");
    const name = basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-agent";
    // agent.yaml deliberately stays metadata-only; runtime defaults preserve compatibility.
    const metadata = { name, version: "0.1.0", description: "Describe what this AI agent does.", author: "", license: "MIT" };
    const manifest: AgentManifest = AgentManifestSchema.parse(metadata);
    await Promise.all([...REQUIRED_DIRECTORIES, "assets", "tools", "connectors", "knowledge", "memory", "tests", ".kiln", ".kiln/skills"].map((directory) => mkdir(join(root, directory), { recursive: true })));
    await writeFile(join(root, "agent.yaml"), YAML.stringify(metadata));
    await writeFile(join(root, "README.md"), `# ${name}\n\n${manifest.description}\n\n## KILN\n\nKILN is an AI Agent Engineering Framework. You own the agent logic; KILN supplies the project structure and reusable runtime foundations.\n\n## Where to work\n\n- Business logic: \`src/agent.ts\`\n- Prompts: \`prompts/\`\n- Workflows: \`workflows/\`\n- Tools and connectors: \`tools/\`, \`connectors/\`\n- Project knowledge: \`knowledge/\`\n- Runtime configuration: \`.kiln/*.yaml\`\n\n## Commands\n\n\`kiln validate\` validates the project.\n\`kiln run ${name}\` prepares its execution plan (no AI is invoked).\n\`kiln pack\` creates a distributable package.\n\`kiln install ./<package>.agent\` installs a package locally.\n`);
    await writeFile(join(root, "LICENSE"), "MIT License\n\nCopyright (c) Your Name\n"); await writeFile(join(root, ".gitignore"), "node_modules/\ndist/\n*.agent\n");
    await writeFile(join(root, "src", "agent.ts"), `import { defineAgent } from "@kiln/sdk";\n\nexport default defineAgent({\n  name: "${name}",\n  async execute(ctx) {\n    // Agent logic goes here.\n  },\n});\n`); await writeFile(join(root, "src", "index.ts"), "export { default as agent } from \"./agent.js\";\n"); await writeFile(join(root, "src", "types.ts"), "export interface AgentInput {}\nexport interface AgentOutput {}\n");
    const prompts: Record<string, string> = { "system.md": "# System Prompt\n\nDescribe the permanent behavior of the agent.\n", "developer.md": "# Developer Prompt\n\nDescribe implementation and engineering constraints.\n", "task.md": "# Task Prompt\n\nDescribe the task-specific instructions.\n", "examples.md": "# Examples\n\nAdd representative input/output examples here.\n", "safety.md": "# Safety\n\nDefine safety, privacy, and escalation boundaries.\n", "variables.yaml": "# Values are available as {{variableName}} in prompt layers.\ntask: \"\"\n" }; for (const [file, content] of Object.entries(prompts)) await writeFile(join(root, "prompts", file), content);
    await writeFile(join(root, "workflows", "main.yaml"), `name: main\n\nsteps:\n  - ${name}\n`); await Promise.all(["tools", "connectors", "memory"].map((directory) => writeFile(join(root, directory, ".gitkeep"), ""))); await writeFile(join(root, "knowledge", "project.md"), "# Project Knowledge\n\nStore domain facts, product context, and reference material here.\n"); await writeFile(join(root, "knowledge", "coding-guidelines.md"), "# Coding Guidelines\n\nDocument project conventions and quality expectations here.\n"); await writeFile(join(root, "tests", "agent.test.ts"), "// Add agent behavior tests here.\nexport {};\n");
    const configs: Record<string, string> = { "config.yaml": "project: " + name + "\n", "runtime.yaml": "provider: openai\nmodel: gpt-5.5\nmemory: true\nevents: true\ncheckpoints: true\nobservability: true\n", "providers.yaml": "default: openai\nproviders:\n  openai:\n    model: gpt-5.5\n  gemini:\n    model: gemini-2.5-pro\n  claude:\n    model: claude-sonnet\n", "observability.yaml": "enabled: true\n", "memory.yaml": "enabled: true\n", "checkpoints.yaml": "enabled: true\n", "events.yaml": "enabled: true\n" }; for (const [file, content] of Object.entries(configs)) await writeFile(join(root, ".kiln", file), content);
    const skills = getSkillTemplates(name);
    for (const [file, content] of Object.entries(skills)) await writeFile(join(root, ".kiln", "skills", file), content);
    return manifest;
  }

  /** Extracts only entries whose canonical destination remains inside destination (Zip Slip protection). */
  private async extractArchive(archivePath: string, destination: string): Promise<void> {
    const source = resolve(archivePath); if (extname(source) !== PACKAGE_EXTENSION) throw new KilnError(`Expected a ${PACKAGE_EXTENSION} package.`);
    try { await access(source); } catch { throw new KilnError(`Package not found: ${source}`); }
    try {
      const archive = await unzipper.Open.file(source);
      for (const entry of archive.files) {
        const entryPath = entry.path.replace(/\\/g, "/");
        const target = resolve(destination, entryPath); const traversal = relative(destination, target);
        if (isAbsolute(entryPath) || traversal === ".." || traversal.startsWith(`..${sep}`) || isAbsolute(traversal)) throw new KilnError(`Unsafe archive entry rejected: ${entry.path}`);
        if (entry.type === "Directory") { await mkdir(target, { recursive: true }); continue; }
        await mkdir(dirname(target), { recursive: true }); await pipeline(entry.stream(), createWriteStream(target));
      }
    } catch (error) { if (error instanceof KilnError) throw error; throw new KilnError("Unable to extract package. The archive may be corrupt.", error); }
  }

  private async listFiles(root: string): Promise<string[]> { const files: string[] = []; const visit = async (path: string): Promise<void> => { for (const entry of await readdir(path, { withFileTypes: true })) { const child = join(path, entry.name); if (entry.isDirectory()) await visit(child); else files.push(relative(root, child).replace(/\\/g, "/")); } }; await visit(root); return files.sort(); }
  private async directorySize(root: string): Promise<number> { const files = await this.listFiles(root); const sizes = await Promise.all(files.map((file) => stat(join(root, file)).then((item) => item.size))); return sizes.reduce((total, size) => total + size, 0); }
}
