import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { KilnError } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerUninstallCommand(program: Command, config: ConfigService): void { program.command("uninstall <name>").description("Alias of remove").action(async (name: string) => { const installed = await config.getInstalled(); const agents = installed.agents.filter((agent) => agent.name !== name); if (agents.length === installed.agents.length) throw new KilnError(`Agent "${name}" is not installed.`); await config.saveInstalled({ agents }); output.success(`${name} was removed.`); }); }
