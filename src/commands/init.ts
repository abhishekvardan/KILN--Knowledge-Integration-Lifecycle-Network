import { Command } from "commander";
import { PackageService } from "../services/PackageService.js";
import { output } from "../utils/output.js";
export function registerInitCommand(program: Command, packages: PackageService): void { program.command("init").description("Scaffold a new agent package in the current directory").action(async () => { const manifest = await packages.scaffold(); output.success(`Created ${manifest.name}@${manifest.version}.`); }); }
