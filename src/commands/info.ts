import { Command } from "commander";
import { ConfigService } from "../services/ConfigService.js";
import { PackageService } from "../services/PackageService.js";
import { KilnError } from "../utils/errors.js";
import { formatPackageDetails } from "../utils/packageView.js";
export function registerInfoCommand(program: Command, config: ConfigService, packages: PackageService): void { program.command("info <name>").option("--json", "Output JSON").description("Display installed package information").action(async (name: string, options: { json?: boolean }) => { const agent = (await config.getInstalled()).agents.find((item) => item.name === name); if (!agent) throw new KilnError(`Agent "${name}" is not installed.`); const details = await packages.inspectDetails(agent.packagePath); console.log(options.json ? JSON.stringify({ ...details, installedAt: agent.installedAt }, null, 2) : formatPackageDetails(details)); }); }
