import { Command } from "commander";
import ora from "ora";
import { PackageService } from "../services/PackageService.js";
import { toErrorMessage } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerPackCommand(program: Command, packages: PackageService): void { program.command("pack").description("Create a .agent archive from the current project").action(async () => { const spinner = ora("Creating package...").start(); try { const path = await packages.createPackage(); spinner.succeed(); output.success(`Created ${path}`); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
