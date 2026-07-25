import { Command } from "commander";
import ora from "ora";
import { ConfigService } from "../../services/ConfigService.js";
import { PackageService } from "../../services/PackageService.js";
import { toErrorMessage } from "../../utils/errors.js";
export function registerInspectCommand(program: Command, config: ConfigService, packages: PackageService): void { program.command("inspect <package-or-directory>").description("Display archive, directory, or installed package metadata").action(async (source: string) => { const spinner = ora("Inspecting package...").start(); try { const installed = (await config.getInstalled()).agents.find((agent) => agent.name === source); const manifest = await packages.inspect(installed?.packagePath ?? source); spinner.succeed(); console.log(JSON.stringify(manifest, null, 2)); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
