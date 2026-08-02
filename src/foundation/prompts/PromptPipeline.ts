import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
export const PROMPT_LAYERS = ["system.md", "developer.md", "task.md", "examples.md", "knowledge.md", "memory.md", "safety.md"] as const;
export interface PromptPipeline { compose(root: string, variables?: Record<string, string>, memory?: string): Promise<string>; }
export class FilePromptPipeline implements PromptPipeline { async compose(root: string, variables: Record<string, string> = {}, memory = ""): Promise<string> { const fileVariables = await readFile(join(root, "prompts", "variables.yaml"), "utf8").then((text) => YAML.parse(text) as Record<string, string>).catch(() => ({})); const values: Record<string, string> = { ...fileVariables, ...variables, memory }; const parts = await Promise.all(PROMPT_LAYERS.map((file) => readFile(join(root, "prompts", file), "utf8").catch(() => ""))); return parts.filter(Boolean).join("\n\n").replace(/{{(\w+)}}/g, (_, key: string) => values[key] ?? `{{${key}}}`); } }
