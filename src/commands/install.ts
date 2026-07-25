import { Command } from "commander";
import ora from "ora";
import { ConfigService } from "../services/ConfigService.js";
import { PackageService } from "../services/PackageService.js";
import { toErrorMessage } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerInstallCommand(program: Command, config: ConfigService, packages: PackageService): void { program.command("install <path>").description("Install a local .agent package").action(async (path: string) => { const spinner = ora("Installing local package...").start(); try { const result = await packages.installArchive(path, config.agentsDirectory); const installed = await config.getInstalled(); const item = { ...result.manifest, installedAt: new Date().toISOString(), packagePath: result.directory }; const index = installed.agents.findIndex((agent) => agent.name === item.name); if (index >= 0) installed.agents[index] = item; else installed.agents.push(item); await config.saveInstalled(installed); spinner.succeed(); output.success(`${item.name}@${item.version} installed.`); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
