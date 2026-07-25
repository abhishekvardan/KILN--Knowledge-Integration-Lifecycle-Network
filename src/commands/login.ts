import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { output } from "../utils/output.js";
export function registerLoginCommand(program: Command, config: ConfigService): void { program.command("login").description("Log in to KILN (mock)").action(async () => { const current = await config.getConfig(); await config.saveConfig({ ...current, authToken: "mock-token" }); output.success("Logged in with mock credentials."); }); }
