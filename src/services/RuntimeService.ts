import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ExecutionPlan } from "../types.js";
import { ConfigService } from "./ConfigService.js";
import { PackageService } from "./PackageService.js";
import type { RuntimeProvider } from "./RuntimeProvider.js";
import { PromptRuntime } from "./RuntimeProvider.js";
import { KilnError } from "../utils/errors.js";

export class RuntimeService {
  private readonly providers = new Map<string, RuntimeProvider>();
  public constructor(private readonly config: ConfigService, private readonly packages: PackageService, providers: RuntimeProvider[] = [new PromptRuntime()]) { providers.forEach((provider) => this.providers.set(provider.name, provider)); }
  public async buildExecutionPlan(name: string): Promise<ExecutionPlan> {
    const installed = (await this.config.getInstalled()).agents.find((agent) => agent.name === name); if (!installed) throw new KilnError(`Package "${name}" is not installed.`);
    const root = resolve(installed.packagePath); const manifest = await this.packages.validateProject(root); const provider = this.providers.get(manifest.runtime); if (!provider) throw new KilnError(`Unsupported runtime: ${manifest.runtime}`);
    const prompts = await this.loadTextFiles(join(root, "prompts"), root); const workflows = await this.loadTextFiles(join(root, "workflows"), root);
    const entrypoint = manifest.entrypoint.replace(/\\/g, "/"); const path = join(root, entrypoint); try { await access(path); } catch { throw new KilnError(`Entrypoint does not exist: ${entrypoint}`); }
    const plan: ExecutionPlan = { packageName: manifest.name, version: manifest.version, description: manifest.description, publisher: manifest.publisher, runtime: manifest.runtime, entrypoint, prompts, workflows, permissions: manifest.permissions, compatibility: manifest.compatibility, variables: manifest.variables, dependencies: manifest.dependencies, metadata: { author: manifest.author, license: manifest.license, homepage: manifest.homepage, repository: manifest.repository, keywords: manifest.keywords, icon: manifest.icon } };
    await provider.validate(plan); return provider.prepare(plan);
  }
  public async getInstalledPackageDirectory(name: string): Promise<string> { const installed = (await this.config.getInstalled()).agents.find((agent) => agent.name === name); if (!installed) throw new KilnError(`Package "${name}" is not installed.`); return resolve(installed.packagePath); }
  private async loadTextFiles(directory: string, root: string): Promise<Record<string, string>> { const files: Record<string, string> = {}; const visit = async (path: string): Promise<void> => { for (const entry of await readdir(path, { withFileTypes: true })) { if (entry.name === ".gitkeep") continue; const child = join(path, entry.name); if (entry.isDirectory()) await visit(child); else files[relative(root, child).replace(/\\/g, "/")] = await readFile(child, "utf8"); } }; await visit(directory); return files; }
}
