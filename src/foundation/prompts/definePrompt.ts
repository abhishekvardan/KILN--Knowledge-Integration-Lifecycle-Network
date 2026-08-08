export interface PromptOptions {
  /** Who the agent is / its permanent behavior. */
  persona?: string;
  /** What this specific call is asking for. */
  task?: string;
  /** Hard rules — rendered as a bullet list. A single string is treated as one rule. */
  constraints?: string | string[];
  /** Representative input/output pairs — rendered as their own section, in order. */
  examples?: string | string[];
  /** Free-form output-shape guidance for non-`ai.object()` calls (object() already writes its own schema instruction). */
  outputFormat?: string;
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Composes a system prompt from named sections instead of ad-hoc string concatenation — the pattern
 * every hand-written agent in this repo's examples used before this existed. Returns a plain string, so
 * it composes naturally into `{ role: "system", content: definePrompt({...}) }`. Sections merge in a
 * fixed, predictable order (persona, task, constraints, examples, outputFormat); omit whichever you don't need.
 */
export function definePrompt(options: PromptOptions): string {
  const sections: string[] = [];
  if (options.persona) sections.push(options.persona.trim());
  if (options.task) sections.push(`Task: ${options.task.trim()}`);
  const constraints = toList(options.constraints);
  if (constraints.length) sections.push(`Constraints:\n${constraints.map((rule) => `- ${rule}`).join("\n")}`);
  const examples = toList(options.examples);
  if (examples.length) sections.push(`Examples:\n${examples.join("\n\n")}`);
  if (options.outputFormat) sections.push(`Output format: ${options.outputFormat.trim()}`);
  return sections.join("\n\n");
}

/** Merges multiple prompt strings/sections (e.g. a shared safety or house-style block reused across agents) into one. */
export function combinePrompts(...parts: (string | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("\n\n");
}
