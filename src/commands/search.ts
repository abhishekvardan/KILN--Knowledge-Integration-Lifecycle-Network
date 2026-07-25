import { Command } from "commander";
import ora from "ora";
import { RegistryService } from "../services/RegistryService.js";
import { toErrorMessage } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerSearchCommand(program: Command, registry: RegistryService): void { program.command("search <query>").description("Search the agent registry").action(async (query: string) => { const spinner = ora("Searching registry...").start(); try { const agents = await registry.search(query); spinner.succeed(); if (!agents.length) return output.warning(`No agents found for "${query}".`); agents.forEach((agent) => console.log(`${agent.name} ${agent.version} — ${agent.description}`)); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
