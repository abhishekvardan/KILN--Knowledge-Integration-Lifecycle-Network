import archiver from "archiver";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import YAML from "yaml";
import { AgentManifestSchema, type AgentManifest } from "./AgentManifest.js";
import { AgentHubError } from "../utils/errors.js";

const PACKAGE_EXTENSION = ".agent";
const REQUIRED_DIRECTORIES = ["prompts", "workflows", "src"];
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist"]);

export class PackageService {
  public async inspect(source: string): Promise<AgentManifest> {
    const path = resolve(source);
    if (extname(path) !== PACKAGE_EXTENSION) return this.validateProject(path);
    const staging = await mkdtemp(join(tmpdir(), "agenthub-inspect-"));
    try { await this.extractArchive(path, staging); return await this.validateProject(staging); }
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
    catch (error) { throw new AgentHubError(`Missing required manifest: ${manifestPath}`, error); }
    let parsed: unknown;
    try { parsed = YAML.parse(raw); } catch (error) { throw new AgentHubError("agent.yaml contains invalid YAML.", error); }
    const validation = AgentManifestSchema.safeParse(parsed);
    if (!validation.success) throw new AgentHubError(`Invalid agent.yaml: ${validation.error.issues.map((i) => `${i.path.join(".") || "manifest"} ${i.message}`).join("; ")}`);
    for (const directory of REQUIRED_DIRECTORIES) {
      try { if (!(await stat(join(root, directory))).isDirectory()) throw new Error(); }
      catch { throw new AgentHubError(`Missing required directory: ${directory}/`); }
    }
    try { await access(join(root, "README.md")); } catch { throw new AgentHubError("Missing required file: README.md"); }
    return validation.data;
  }

  public async createPackage(projectDirectory = process.cwd(), destinationDirectory = projectDirectory): Promise<string> {
    const root = resolve(projectDirectory); const manifest = await this.validateProject(root);
    const outputPath = join(resolve(destinationDirectory), `${manifest.name}-${manifest.version}${PACKAGE_EXTENSION}`);
    await new Promise<void>((resolvePromise, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } }); const stream = createWriteStream(outputPath);
      stream.on("close", resolvePromise); stream.on("error", reject); archive.on("error", reject);
      archive.pipe(stream);
      archive.file(join(root, "agent.yaml"), { name: "agent.yaml" });
      archive.file(join(root, "README.md"), { name: "README.md" });
      for (const directory of REQUIRED_DIRECTORIES) {
        archive.append("", { name: `${directory}/` });
        archive.directory(join(root, directory), directory);
      }
      archive.finalize();
    });
    return outputPath;
  }

  /** Installs an archive source. Future remote downloads can save to a temp path and use this same method. */
  public async installArchive(archivePath: string, agentsDirectory: string): Promise<{ manifest: AgentManifest; directory: string }> {
    const source = resolve(archivePath);
    if (extname(source) !== PACKAGE_EXTENSION) throw new AgentHubError(`Expected a ${PACKAGE_EXTENSION} package.`);
    try { await access(source); } catch { throw new AgentHubError(`Package not found: ${source}`); }
    const staging = await mkdtemp(join(tmpdir(), "agenthub-"));
    try {
      await this.extractArchive(source, staging);
      const manifest = await this.validateProject(staging);
      const target = join(agentsDirectory, manifest.name);
      await rm(target, { recursive: true, force: true }); await cp(staging, target, { recursive: true, filter: (from) => !IGNORED_DIRECTORIES.has(basename(from)) });
      return { manifest, directory: target };
    } catch (error) { if (error instanceof AgentHubError) throw error; throw new AgentHubError("Unable to install package. The archive may be corrupt.", error); }
    finally { await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }

  public async scaffold(projectDirectory = process.cwd()): Promise<AgentManifest> {
    const root = resolve(projectDirectory); const entries = await readdir(root);
    if (entries.length) throw new AgentHubError("Refusing to initialize a non-empty directory.");
    const name = basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-agent";
    const manifest: AgentManifest = { name, version: "0.1.0", description: "Describe what this agent does." };
    await Promise.all(REQUIRED_DIRECTORIES.map((directory) => import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, directory), { recursive: true }))));
    await writeFile(join(root, "agent.yaml"), YAML.stringify(manifest));
    await writeFile(join(root, "README.md"), `# ${name}\n\n${manifest.description}\n`);
    await writeFile(join(root, "prompts", ".gitkeep"), ""); await writeFile(join(root, "workflows", ".gitkeep"), ""); await writeFile(join(root, "src", "index.ts"), "export {};\n");
    return manifest;
  }

  /** Extracts only entries whose canonical destination remains inside destination (Zip Slip protection). */
  private async extractArchive(archivePath: string, destination: string): Promise<void> {
    const source = resolve(archivePath); if (extname(source) !== PACKAGE_EXTENSION) throw new AgentHubError(`Expected a ${PACKAGE_EXTENSION} package.`);
    try { await access(source); } catch { throw new AgentHubError(`Package not found: ${source}`); }
    try {
      const archive = await unzipper.Open.file(source);
      for (const entry of archive.files) {
        const entryPath = entry.path.replace(/\\/g, "/");
        const target = resolve(destination, entryPath); const traversal = relative(destination, target);
        if (isAbsolute(entryPath) || traversal === ".." || traversal.startsWith(`..${sep}`) || isAbsolute(traversal)) throw new AgentHubError(`Unsafe archive entry rejected: ${entry.path}`);
        if (entry.type === "Directory") { await mkdir(target, { recursive: true }); continue; }
        await mkdir(dirname(target), { recursive: true }); await pipeline(entry.stream(), createWriteStream(target));
      }
    } catch (error) { if (error instanceof AgentHubError) throw error; throw new AgentHubError("Unable to extract package. The archive may be corrupt.", error); }
  }
}
