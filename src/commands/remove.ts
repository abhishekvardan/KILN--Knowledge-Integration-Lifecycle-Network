import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { AgentHubError } from "../utils/errors.js";
import { output } from "../utils/output.js";
export function registerRemoveCommand(program: Command, config: ConfigService): void {
  program.command("remove <name>").description("Remove an installed agent").action(async (name: string) => {
    const installed = await config.getInstalled(); const remaining = installed.agents.filter((agent) => agent.name !== name);
    if (remaining.length === installed.agents.length) throw new AgentHubError(`Agent "${name}" is not installed.`);
    await config.saveInstalled({ agents: remaining }); output.success(`${name} was removed.`);
  });
}
