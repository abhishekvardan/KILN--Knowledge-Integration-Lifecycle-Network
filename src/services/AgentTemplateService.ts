import { access, cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { AgentManifestSchema, type AgentManifest } from "./AgentManifest.js";
import { ConfigService } from "./ConfigService.js";
import { KilnError } from "../utils/errors.js";

const BUILT_INS = ["backend", "reviewer", "researcher", "planner", "coder", "tester", "summarizer"];
export class AgentTemplateService {
  public constructor(private readonly config: ConfigService) {}
  public async initialize(): Promise<void> { await this.config.initialize(); await Promise.all(BUILT_INS.map((name) => this.ensureTemplate(name))); }
  public async list(): Promise<string[]> { await this.initialize(); return (await readdir(this.config.templatesDirectory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); }
  public async info(name: string): Promise<AgentManifest> { await this.initialize(); return this.readManifest(join(this.config.templatesDirectory, name)); }
  public async validate(name: string): Promise<AgentManifest> { return this.info(name); }
  public templatePath(name: string): string { return join(this.config.templatesDirectory, name); }
  public async create(name: string, destination = join(process.cwd(), "agents", name)): Promise<AgentManifest> { const source = join(this.config.templatesDirectory, name); await this.info(name); try { await access(destination); throw new KilnError(`Destination already exists: ${destination}`); } catch (error) { if (error instanceof KilnError) throw error; } await mkdir(resolve(destination, ".."), { recursive: true }); await cp(source, destination, { recursive: true }); return this.readManifest(destination); }
  private async ensureTemplate(name: string): Promise<void> { const root = join(this.config.templatesDirectory, name); try { if ((await stat(root)).isDirectory()) return; } catch { /* create */ } const manifest: AgentManifest = { name, version: "0.1.0", description: `${name} agent template.`, publisher: "kiln", license: "MIT", runtime: "prompt", entrypoint: "prompts/system.md", provider: "prompt", memory: "short-term", keywords: [name], permissions: [], compatibility: {}, variables: {}, dependencies: {}, capabilities: [name], dependsOn: [], inputs: {}, outputs: {} }; await Promise.all([mkdir(join(root, "prompts"), { recursive: true }), mkdir(join(root, "knowledge"), { recursive: true }), mkdir(join(root, "tests"), { recursive: true })]); await writeFile(join(root, "agent.yaml"), YAML.stringify(manifest)); await writeFile(join(root, "README.md"), `# ${name} agent\n\nGenerated from the KILN ${name} template.\n`); await writeFile(join(root, "prompts", "system.md"), `# System\n\nYou are a ${name} agent.\n`); await writeFile(join(root, "prompts", "developer.md"), "# Developer\n\nFollow the package permissions and capabilities.\n"); await writeFile(join(root, "prompts", "task.md"), "# Task\n\n{{task}}\n"); }
  private async readManifest(root: string): Promise<AgentManifest> { try { const value = YAML.parse(await readFile(join(root, "agent.yaml"), "utf8")); return AgentManifestSchema.parse(value); } catch (error) { throw new KilnError(`Invalid template: ${root}`, error); } }
}
