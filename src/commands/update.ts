import { Command } from "commander";
import ora from "ora";
import { toErrorMessage } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerUpdateCommand(program: Command): void { program.command("update <name>").description("Update an installed agent (mock)").action(async (name: string) => { const spinner = ora(`Checking updates for ${name}...`).start(); try { spinner.succeed(); output.info(`Mock registry: no update information is available for ${name}.`); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
