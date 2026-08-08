import { Command } from "commander";
import chalk from "chalk";
import { AgentTemplateService } from "../services/AgentTemplateService.js";
import { AgentCompositionValidator } from "../services/AgentCompositionValidator.js";
import { PackageService } from "../services/PackageService.js";
import { output } from "../utils/output.js";

export function registerAgentCommand(program: Command, templates: AgentTemplateService, validator: AgentCompositionValidator, packages: PackageService): void {
  const command = program.command("agent").description("Compose agents from templates, or manage agents within the current project");
  command.command("create <template>").description("Scaffold a new project from a built-in template").action(async (template: string) => { const manifest = await templates.create(template); output.success(`Created agent ${manifest.name}.`); });
  command.command("validate <name>").description("Validate a template").action(async (name: string) => { const report = await validator.validate(name); report.errors.forEach((item) => console.log(chalk.red(`error: ${item}`))); report.warnings.forEach((item) => console.log(chalk.yellow(`warning: ${item}`))); if (report.valid) output.success(`${name} template is valid.`); else process.exitCode = 1; });

  command.command("add <name>").description("Add a new agent to the current project (no separate `kiln init` needed)").action(async (name: string) => {
    const { path, legacySingleAgentPresent } = await packages.addAgent(process.cwd(), name);
    output.success(`Added agent "${name}" at ${path}.`);
    if (legacySingleAgentPresent) console.log(chalk.yellow(`Note: this project still has src/agent.ts — "kiln run <package>" will keep running only that one. Use "<package>:${name}" to run this one, or remove src/agent.ts so a bare run covers every agent.`));
  });
  command.command("list").description("List the agents the current project defines").action(async () => {
    const names = await packages.listAgentFiles(process.cwd());
    if (!names.length) { console.log("No agents found (expected src/agent.ts or src/agents/*.ts)."); return; }
    names.forEach((name) => console.log(name));
  });
}
