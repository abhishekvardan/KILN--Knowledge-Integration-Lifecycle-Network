import { Command } from "commander";
import ora from "ora";
import { ConfigService } from "../../services/ConfigService.js";
import { PackageService } from "../../services/PackageService.js";
import { toErrorMessage } from "../../utils/errors.js";
import { formatPackageDetails } from "../../utils/packageView.js";
export function registerInspectCommand(program: Command, config: ConfigService, packages: PackageService): void { program.command("inspect <package-or-directory>").option("--json", "Output JSON").description("Display archive, directory, or installed package metadata").action(async (source: string, options: { json?: boolean }) => { const spinner = ora("Inspecting package...").start(); try { const installed = (await config.getInstalled()).agents.find((agent) => agent.name === source); const details = await packages.inspectDetails(installed?.packagePath ?? source); spinner.succeed(); console.log(options.json ? JSON.stringify(details, null, 2) : formatPackageDetails(details)); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
