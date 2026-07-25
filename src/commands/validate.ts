import { Command } from "commander";
import { PackageService } from "../services/PackageService.js";
import { output } from "../utils/output.js";
export function registerValidateCommand(program: Command, packages: PackageService): void { program.command("validate").description("Validate the current agent package").action(async () => { const manifest = await packages.validateProject(); output.success(`${manifest.name}@${manifest.version} is valid.`); }); }
