import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { output } from "../utils/output.js";
export function registerListCommand(program: Command, config: ConfigService): void {
  program.command("list").description("List installed agents").action(async () => {
    const { agents } = await config.getInstalled(); if (!agents.length) return output.info("No agents installed.");
    agents.forEach((agent) => console.log(`${agent.name} ${agent.version} — ${agent.description}`));
  });
}
