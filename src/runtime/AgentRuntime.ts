import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { access, cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { extname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register as registerTsx } from "tsx/esm/api";
import { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { KilnError, toErrorMessage } from "../utils/errors.js";
import type { AgentContext, AgentDefinition, BoundAI } from "../foundation/agents/defineAgent.js";
import type { ChatMessage, ChatResult, ToolDefinitionForProvider } from "./interfaces/ProviderAdapter.js";
import type { ToolExecutionContext } from "./interfaces/Tool.js";
import { EventBus } from "./EventBus.js";
import { MemoryManager } from "./MemoryManager.js";
import { ProviderManager } from "./ProviderManager.js";
import { RuntimeRegistry } from "./RuntimeRegistry.js";
import { ToolManager } from "./ToolManager.js";

let tsSupportReady = false;

/** Enables in-process import() of .ts agent files, once per process (mirrors what `tsx src/index.ts` already does for kiln itself). */
function ensureTsSupport(): void {
  if (tsSupportReady) return;
  tsSupportReady = true;
  registerTsx();
}

/** Kiln's own sdk entrypoint on disk: dist/sdk.js when built, src/sdk.ts when running from source via tsx. */
function resolveKilnSdkPath(): string {
  const built = fileURLToPath(new URL("../sdk.js", import.meta.url));
  if (existsSync(built)) return built;
  return fileURLToPath(new URL("../sdk.ts", import.meta.url));
}

const shimPromises = new Map<string, Promise<void>>();

/**
 * Agent projects are plain directories (no `npm install`), so the "@kiln/sdk" specifier they import
 * has nothing to resolve against. Drop a real node_modules/@kiln/sdk shim re-exporting kiln's own SDK
 * so normal Node module resolution — not a custom loader hook — finds it. Idempotent; self-healing
 * whether the directory came from `kiln init`, an installed .agent archive, or a hand-made fixture.
 *
 * A package can hold hundreds of agents that all run concurrently against this SAME directory, so this
 * is memoized per directory — without it, concurrent first-runs race to write package.json/the shim
 * files and can corrupt them (seen as "Invalid package config ... package.json").
 */
function ensureSdkShim(packageDirectory: string): Promise<void> {
  const cached = shimPromises.get(packageDirectory);
  if (cached) return cached;
  const promise = ensureSdkShimOnce(packageDirectory).catch((error: unknown) => { shimPromises.delete(packageDirectory); throw error; });
  shimPromises.set(packageDirectory, promise);
  return promise;
}

/** Packages an agent author is expected to `import` directly (e.g. `defineTool({ parameters: z.object(...) })`) but that `kiln pack`/`kiln install` never bundle, since only agent.yaml/README/LICENSE/.gitignore/prompts/workflows/src are archived. */
const RUNTIME_DEPENDENCIES = ["zod"];

/** Real npm packages, unlike the synthetic @kiln/sdk shim, so link the whole package directory rather than hand-writing a re-export (their own package.json "exports"/subpath maps must stay intact). */
async function ensureDependencyShim(packageDirectory: string, dependencyName: string): Promise<void> {
  const target = join(packageDirectory, "node_modules", dependencyName);
  if (existsSync(target)) return;
  const source = fileURLToPath(new URL(`../../node_modules/${dependencyName}`, import.meta.url));
  if (!existsSync(source)) return;
  await mkdir(join(packageDirectory, "node_modules"), { recursive: true });
  try { await symlink(source, target, "junction"); }
  catch { await cp(source, target, { recursive: true }); }
}

async function ensureSdkShimOnce(packageDirectory: string): Promise<void> {
  const shimDir = join(packageDirectory, "node_modules", "@kiln", "sdk");
  const shimEntry = join(shimDir, "index.js");
  if (!existsSync(shimEntry)) {
    await mkdir(shimDir, { recursive: true });
    await writeFile(join(shimDir, "package.json"), JSON.stringify({ name: "@kiln/sdk", version: "0.0.0", type: "module", main: "./index.js" }, null, 2));
    await writeFile(shimEntry, `export * from ${JSON.stringify(pathToFileURL(resolveKilnSdkPath()).href)};\n`);
  }
  await Promise.all(RUNTIME_DEPENDENCIES.map((dependency) => ensureDependencyShim(packageDirectory, dependency)));
  // Without a package.json declaring "type": "module", Node treats .ts files as CommonJS and the
  // shim's nested ESM graph can't be synchronously required (ERR_VM_MODULE_LINK_FAILURE).
  const packageJsonPath = join(packageDirectory, "package.json");
  if (!existsSync(packageJsonPath)) await writeFile(packageJsonPath, JSON.stringify({ name: "agent-project", private: true, type: "module" }, null, 2));
}

/** definition.tools -> provider-wire-format schema is a pure function of static data (zodToJsonSchema doesn't change between runs of the same agent) — cache it per definition instead of reconverting on every single run. */
const toolDefinitionsCache = new WeakMap<AgentDefinition, ToolDefinitionForProvider[]>();
function toolDefinitionsFor(definition: AgentDefinition): ToolDefinitionForProvider[] {
  const cached = toolDefinitionsCache.get(definition);
  if (cached) return cached;
  const computed = (definition.tools ?? []).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters ? (tool.parameters instanceof ZodType ? zodToJsonSchema(tool.parameters) : tool.parameters) : { type: "object", properties: {} } }));
  toolDefinitionsCache.set(definition, computed);
  return computed;
}

export interface AgentRunResult { runId: string; status: "succeeded" | "failed"; output?: unknown; error?: string; durationMs: number; agentName?: string }
export interface AgentRunOptions { runId?: string; agentName?: string }
export interface AgentDescriptor { agentName?: string }

/**
 * Runs an agent from a package in-process (no subprocess spawn). A package holds either a single agent
 * (legacy `src/agent.ts`) or many (`src/agents/<name>.ts` each), so one `kiln init` project can define —
 * and one `kiln run` can fan out across — hundreds of agents without a separate `kiln init` per agent.
 */
export class AgentRuntime {
  public constructor(private readonly providers: ProviderManager, private readonly memory: MemoryManager, private readonly events: EventBus) {}

  /** Agents defined in a package: one entry per src/agents/*.ts file, or a single unnamed entry for legacy src/agent.ts. */
  public async listAgents(packageDirectory: string): Promise<AgentDescriptor[]> {
    try {
      const files = (await readdir(resolvePath(packageDirectory, "src", "agents"))).filter((file) => extname(file) === ".ts");
      if (files.length) return files.map((file) => ({ agentName: file.slice(0, -extname(file).length) }));
    } catch { /* no src/agents directory */ }
    try { await access(resolvePath(packageDirectory, "src", "agent.ts")); return [{}]; } catch { return []; }
  }

  private async resolveEntrypoint(packageDirectory: string, agentName?: string): Promise<string> {
    if (agentName) {
      const path = resolvePath(packageDirectory, "src", "agents", `${agentName}.ts`);
      try { await access(path); return path; } catch { throw new KilnError(`No agent named "${agentName}" in ${packageDirectory} (expected src/agents/${agentName}.ts).`); }
    }
    const single = resolvePath(packageDirectory, "src", "agent.ts");
    if (existsSync(single)) return single;
    const agents = await this.listAgents(packageDirectory);
    if (agents.length === 1) return this.resolveEntrypoint(packageDirectory, agents[0].agentName);
    if (agents.length > 1) throw new KilnError(`${packageDirectory} defines ${agents.length} agents (${agents.map((a) => a.agentName).join(", ")}) — specify which one, e.g. "<package>:<agent>".`);
    throw new KilnError(`Executable agent entrypoint not found in ${packageDirectory} (expected src/agent.ts or src/agents/*.ts).`);
  }

  /** Loads a package's agent file(s) but does not run anything — the entrypoint-resolution half of `run()`, exposed so callers (e.g. Orchestrator) can load once and execute many times. */
  public async load(packageDirectory: string, agentName?: string): Promise<AgentDefinition> {
    ensureTsSupport();
    const entrypoint = await this.resolveEntrypoint(packageDirectory, agentName);
    await ensureSdkShim(packageDirectory);
    const imported = (await import(pathToFileURL(entrypoint).href)) as { default?: AgentDefinition };
    const definition = imported.default;
    if (!definition || typeof definition.execute !== "function") throw new KilnError(`${entrypoint} must export a default defineAgent(...) definition.`);
    return definition;
  }

  public async run(packageDirectory: string, input: unknown, options: AgentRunOptions = {}): Promise<AgentRunResult> {
    const runId = options.runId ?? randomUUID();
    try {
      const definition = await this.load(packageDirectory, options.agentName);
      return await this.runDefinition(definition, input, { ...options, runId });
    } catch (error) {
      // load() itself failed (bad path/entrypoint) — runDefinition() handles execute() failures on its own.
      const message = toErrorMessage(error);
      await this.events.publish({ type: "AgentStarted", executionId: runId, at: new Date(), payload: { packageDirectory, agentName: options.agentName, input } });
      await this.events.publish({ type: "AgentFailed", executionId: runId, at: new Date(), payload: { error: message } });
      return { runId, status: "failed", error: message, durationMs: 0, agentName: options.agentName };
    }
  }

  /**
   * Runs an already-in-hand AgentDefinition — no file, no directory, no `kiln init`. Define an agent
   * inline with `defineAgent({...})` in the same file/process and run it directly; this is what `run()`
   * (file-based) and `Orchestrator` (multi-step pipelines) both build on underneath.
   */
  public async runDefinition(definition: AgentDefinition, input: unknown, options: AgentRunOptions = {}): Promise<AgentRunResult> {
    const runId = options.runId ?? randomUUID();
    const startedAt = Date.now();
    await this.events.publish({ type: "AgentStarted", executionId: runId, at: new Date(), payload: { agent: definition.name, agentName: options.agentName, input } });
    try {
      const ctx = this.createContext(definition, runId, input);
      const output = await definition.execute(ctx);
      await this.events.publish({ type: "AgentCompleted", executionId: runId, at: new Date(), payload: { output } });
      return { runId, status: "succeeded", output, durationMs: Date.now() - startedAt, agentName: options.agentName };
    } catch (error) {
      const message = toErrorMessage(error);
      await this.events.publish({ type: "AgentFailed", executionId: runId, at: new Date(), payload: { error: message } });
      return { runId, status: "failed", error: message, durationMs: Date.now() - startedAt, agentName: options.agentName };
    }
  }

  private createContext(definition: AgentDefinition, runId: string, input: unknown): AgentContext {
    const model = definition.model ?? "gpt-4o-mini";
    const log = (event: string, data?: unknown): void => { void this.events.publish({ type: "AgentLog", executionId: runId, at: new Date(), payload: { event, data } }); };

    const scopedRegistry = new RuntimeRegistry();
    const scopedTools = new ToolManager(scopedRegistry);
    for (const tool of definition.tools ?? []) scopedTools.register(tool);
    const toolCtx: ToolExecutionContext = { runId, log };
    const tools: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const tool of definition.tools ?? []) tools[tool.name] = (toolInput: unknown) => scopedTools.invoke(tool.name, toolInput, toolCtx);

    const resolveProvider = () => {
      if (!definition.provider) throw new KilnError(`Agent "${definition.name}" does not declare a provider.`);
      const provider = this.providers.resolve(definition.provider);
      if (!provider) throw new KilnError(`Provider "${definition.provider}" is not registered.`);
      return provider;
    };

    const toolDefinitions = toolDefinitionsFor(definition);

    const ai: BoundAI = {
      chat: (options) => resolveProvider().chat({ model, ...options }),
      stream: (options, onChunk) => resolveProvider().stream({ model, ...options }, onChunk),
      json: (options) => resolveProvider().json({ model, ...options }),
      run: async ({ messages, maxSteps = 4 }) => {
        const provider = resolveProvider();
        const conversation: ChatMessage[] = [...messages];
        let last: ChatResult = { content: "" };
        for (let step = 0; step < maxSteps; step++) {
          last = await provider.toolCall({ model, messages: conversation, tools: toolDefinitions.length ? toolDefinitions : undefined });
          if (!last.toolCalls?.length) return last;
          conversation.push({ role: "assistant", content: last.content, toolCalls: last.toolCalls });
          for (const call of last.toolCalls) {
            log("ToolCallRequested", { tool: call.name, arguments: call.arguments });
            let result: unknown;
            try { result = await scopedTools.invoke(call.name, call.arguments, toolCtx); }
            catch (error) { result = { error: toErrorMessage(error) }; }
            conversation.push({ role: "tool", name: call.name, toolCallId: call.id, content: JSON.stringify(result) });
          }
        }
        return last;
      },
      object: async ({ messages, schema, maxAttempts = 3 }) => {
        const provider = resolveProvider();
        // Smaller models confuse "the schema" with "an instance of it" if the schema is just dropped in the
        // prompt — they echo type/properties/required back verbatim. Spelling out the distinction explicitly
        // (and showing one concrete schema-vs-instance example) is the difference between that and real data.
        const schemaInstruction: ChatMessage = {
          role: "system",
          content:
            `You must respond with ONLY a JSON DATA OBJECT — an actual answer, never the schema itself, never keys named ` +
            `"type"/"properties"/"required"/"$schema". Here is the JSON Schema describing the shape your DATA OBJECT must ` +
            `have (for reference only — do not copy it back): ${JSON.stringify(zodToJsonSchema(schema))}\n\n` +
            `Example of the difference: if the schema says {"type":"object","properties":{"name":{"type":"string"}}}, a ` +
            `correct DATA answer looks like {"name":"Alice"} — real values, not type descriptions. ` +
            "No markdown, no code fences, no commentary outside the JSON.",
        };
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const conversation: ChatMessage[] = attempt === 1
            ? [schemaInstruction, ...messages]
            : [schemaInstruction, ...messages, { role: "user", content: `Your previous response was invalid: ${lastError}. Respond again with ONLY corrected JSON matching the required schema.` }];
          let raw: unknown;
          try {
            raw = await provider.json({ model, messages: conversation });
          } catch (error) {
            lastError = toErrorMessage(error);
            log("ObjectAttemptFailed", { attempt, error: lastError });
            continue;
          }
          const parsed = schema.safeParse(raw);
          if (parsed.success) return parsed.data;
          lastError = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
          log("ObjectAttemptFailed", { attempt, error: lastError });
        }
        throw new KilnError(`ai.object() did not produce output matching the schema after ${maxAttempts} attempt(s): ${lastError}`);
      },
    };

    const memory = {
      get: async (key: string) => (await this.memory.resolve("short-term")?.get(key)) ?? undefined,
      set: async (key: string, value: unknown) => { await this.memory.resolve("short-term")?.set(key, value); },
    };

    return { input, runId, ai, tools, memory, log };
  }
}
