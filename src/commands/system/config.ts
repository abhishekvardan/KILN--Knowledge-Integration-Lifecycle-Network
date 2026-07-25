import { Command } from "commander";
import { ConfigService } from "../../services/ConfigService.js";
import { AgentHubError } from "../../utils/errors.js";
import { output } from "../../utils/output.js";
export function registerConfigCommand(program: Command, config: ConfigService): void { const command = program.command("config").description("Manage AgentHub configuration"); command.command("list").action(async () => { const values = await config.listValues(); Object.entries(values).forEach(([key, value]) => console.log(`${key}=${key === "authToken" ? "***" : value}`)); }); command.command("get <key>").action(async (key: string) => { const value = await config.getValue(key); if (value === undefined) throw new AgentHubError(`Configuration key "${key}" is not set.`); console.log(key === "authToken" ? "***" : value); }); command.command("set <key> <value>").action(async (key: string, value: string) => { await config.setValue(key, value); output.success(`Set ${key}.`); }); }
