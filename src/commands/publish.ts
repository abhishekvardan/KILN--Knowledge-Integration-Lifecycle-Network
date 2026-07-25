import { Command } from "commander";
import ora from "ora";
import { RegistryService } from "../services/RegistryService.js";
import { toErrorMessage } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerPublishCommand(program: Command, registry: RegistryService): void { program.command("publish").description("Publish the current agent (mock)").action(async () => { const spinner = ora("Publishing...").start(); try { const result = await registry.publish(); spinner.succeed(); output.success(`Mock publication created: ${result.id}`); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
