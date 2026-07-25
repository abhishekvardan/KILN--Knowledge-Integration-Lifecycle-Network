import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { output } from "../utils/output.js";
export function registerLogoutCommand(program: Command, config: ConfigService): void { program.command("logout").description("Log out from KILN").action(async () => { const current = await config.getConfig(); delete current.authToken; await config.saveConfig(current); output.success("Logged out."); }); }
