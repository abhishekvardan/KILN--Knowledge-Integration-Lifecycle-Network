import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig, InstalledAgents } from "../types.js";
import { AgentHubError } from "../utils/errors.js";

const DEFAULT_CONFIG: AppConfig = { registryUrl: "https://registry.agenthub.dev" };
const DEFAULT_INSTALLED: InstalledAgents = { agents: [] };

export class ConfigService {
  public readonly rootDirectory = join(homedir(), ".agenthub");
  public readonly agentsDirectory = join(this.rootDirectory, "agents");
  public readonly cacheDirectory = join(this.rootDirectory, "cache");
  private readonly configPath = join(this.rootDirectory, "config.json");
  private readonly installedPath = join(this.rootDirectory, "installed.json");

  public async initialize(): Promise<void> {
    try {
      await Promise.all([mkdir(this.agentsDirectory, { recursive: true }), mkdir(this.cacheDirectory, { recursive: true })]);
      await this.ensureFile(this.configPath, DEFAULT_CONFIG);
      await this.ensureFile(this.installedPath, DEFAULT_INSTALLED);
    } catch (error) {
      throw new AgentHubError(`Unable to initialize ${this.rootDirectory}.`, error);
    }
  }

  public async getConfig(): Promise<AppConfig> { return this.readJson<AppConfig>(this.configPath, DEFAULT_CONFIG); }
  public async saveConfig(config: AppConfig): Promise<void> { await this.writeJson(this.configPath, config); }
  public async listValues(): Promise<AppConfig> { return this.getConfig(); }
  public async getValue(key: string): Promise<string | undefined> { return (await this.getConfig())[key]; }
  public async setValue(key: string, value: string): Promise<void> {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) throw new AgentHubError("Configuration keys must use letters, numbers, underscores, or hyphens.");
    await this.saveConfig({ ...(await this.getConfig()), [key]: value });
  }
  public async getInstalled(): Promise<InstalledAgents> { return this.readJson<InstalledAgents>(this.installedPath, DEFAULT_INSTALLED); }
  public async saveInstalled(installed: InstalledAgents): Promise<void> { await this.writeJson(this.installedPath, installed); }

  private async ensureFile(path: string, initialValue: object): Promise<void> {
    try { await readFile(path, "utf8"); } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") await this.writeJson(path, initialValue);
      else throw error;
    }
  }
  private async readJson<T>(path: string, fallback: T): Promise<T> {
    await this.initialize();
    try { return JSON.parse(await readFile(path, "utf8")) as T; }
    catch (error) { throw new AgentHubError(`Unable to read ${path}; ensure it contains valid JSON.`, error); }
  }
  private async writeJson(path: string, value: object): Promise<void> {
    try { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
    catch (error) { throw new AgentHubError(`Unable to write ${path}.`, error); }
  }
}
