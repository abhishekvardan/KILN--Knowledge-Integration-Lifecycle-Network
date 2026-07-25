import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { KilnError } from "../utils/errors.js";
export function registerInfoCommand(program: Command, config: ConfigService): void { program.command("info <name>").description("Display installed package metadata").action(async (name: string) => { const agent = (await config.getInstalled()).agents.find((item) => item.name === name); if (!agent) throw new KilnError(`Agent "${name}" is not installed.`); console.log(JSON.stringify(agent, null, 2)); }); }
