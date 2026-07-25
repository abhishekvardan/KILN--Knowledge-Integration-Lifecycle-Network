import { Command } from "commander";
import ora from "ora";
import { basename, extname, join } from "node:path";
import { PackageService } from "../../services/PackageService.js";
import { toErrorMessage } from "../../utils/errors.js";
import { output } from "../../utils/output.js";
export function registerUnpackCommand(program: Command, packages: PackageService): void { program.command("unpack <package.agent> [destination]").description("Safely extract a .agent archive").action(async (archive: string, destination?: string) => { const target = destination ?? join(process.cwd(), basename(archive, extname(archive))); const spinner = ora("Extracting package...").start(); try { const manifest = await packages.unpack(archive, target); spinner.succeed(); output.success(`Extracted ${manifest.name}@${manifest.version} to ${target}`); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
