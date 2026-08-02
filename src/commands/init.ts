import { Command } from "commander";
import { join } from "node:path";
import { PackageService } from "../services/PackageService.js";
import { output } from "../utils/output.js";
export function registerInitCommand(program: Command, packages: PackageService): void { program.command("init [name]").description("Scaffold an AI agent project").action(async (name?: string) => { const directory = name ? join(process.cwd(), name) : process.cwd(); const manifest = await packages.scaffold(directory); output.success(`Created ${manifest.name}@${manifest.version}.`); }); }
