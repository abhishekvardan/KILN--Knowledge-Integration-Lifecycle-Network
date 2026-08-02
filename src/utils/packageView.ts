import chalk from "chalk";
import type { PackageDetails } from "../types.js";

const value = (item: unknown): string => Array.isArray(item) ? item.join(", ") || "—" : typeof item === "object" && item !== null ? Object.entries(item as Record<string, string>).map(([key, entry]) => `${key} ${entry}`).join(", ") || "—" : String(item || "—");
export function formatPackageDetails(details: PackageDetails): string {
  const { manifest, files, size, createdTime } = details; const rows: Array<[string, unknown]> = [["Name", manifest.name], ["Version", manifest.version], ["Description", manifest.description], ["Publisher", manifest.publisher], ["Author", manifest.author], ["License", manifest.license], ["Repository", manifest.repository], ["Homepage", manifest.homepage], ["Runtime", manifest.runtime], ["Entrypoint", manifest.entrypoint], ["Permissions", manifest.permissions], ["Compatibility", manifest.compatibility], ["Variables", manifest.variables], ["Dependencies", manifest.dependencies], ["Files", files.length], ["Package Size", `${size} bytes`], ["Created Time", createdTime.toISOString()]];
  return `${chalk.cyan.bold("Package")}\n\n${rows.map(([label, item]) => `${chalk.gray(label)}\n${value(item)}`).join("\n\n")}`;
}
