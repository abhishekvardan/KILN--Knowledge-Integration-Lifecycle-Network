import { Command } from "commander";
import chalk from "chalk";
import { PackageService } from "../../services/PackageService.js";
export function registerLintCommand(program: Command, packages: PackageService): void {
  program.command("lint").description("Report local package quality issues").action(async () => { const report = await packages.lint(); report.errors.forEach((message) => console.log(chalk.red(`error: ${message}`))); report.warnings.forEach((message) => console.log(chalk.yellow(`warning: ${message}`))); if (!report.errors.length && !report.warnings.length) console.log(chalk.green("No issues found.")); const color = report.score >= 80 ? chalk.green : report.score >= 50 ? chalk.yellow : chalk.red; console.log(color(`Quality score: ${report.score}/100`)); if (report.errors.length) process.exitCode = 1; });
}
