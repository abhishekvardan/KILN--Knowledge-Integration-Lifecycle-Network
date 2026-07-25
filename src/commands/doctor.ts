import { Command } from "commander";
import { access } from "node:fs/promises";
import { ConfigService } from "../services/ConfigService.js";
import { output } from "../utils/output.js";
export function registerDoctorCommand(program: Command, config: ConfigService): void { program.command("doctor").description("Check local CLI health").action(async () => { await config.initialize(); await access(config.rootDirectory); output.success(`Configuration is healthy: ${config.rootDirectory}`); output.info("Registry networking is currently mocked."); }); }
