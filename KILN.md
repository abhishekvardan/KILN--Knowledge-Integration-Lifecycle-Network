# KILN.md — how to use kiln (for AI agents and the humans directing them)

This file is written so an AI assistant can read it once and correctly build, run, and orchestrate
AI agents with `kiln` — no other documentation required. Every command, type, and default below is
taken directly from kiln's source, not guessed. If something here conflicts with what you observe at
runtime, trust the runtime and treat this file as stale for that detail.

## What kiln is

`kiln` is a CLI + SDK (`@abhishekvardanbotta/kiln`) for building and orchestrating AI agents. It gives
you, out of the box, the pieces every real agent project ends up hand-building anyway:

- A unified AI client (`ctx.ai`) that works the same across OpenAI, Groq, and Ollama.
- An automatic tool-calling loop (`ctx.ai.run`) — no hand-rolled "check for tool_calls, execute, feed
  back, repeat".
- Self-correcting structured output (`ctx.ai.object`) — schema-validated, retries on its own on failed
  validation.
- MCP (Model Context Protocol) support — any MCP server's tools become normal kiln tools in one call.
- A real DAG orchestrator (`kiln.orchestrate`) — dependency-ordered, concurrent, retrying, with
  cascading failure isolation.
- An HTTP server (`kiln serve`) so any backend language can drive agents over REST + SSE.

**Gemini and Claude providers are stubs today** — they throw `"<name> is not implemented yet."` if you
try to use them. Only `openai`, `groq`, and `ollama` actually work. Don't recommend Gemini/Claude to a
user expecting a working provider.

## Two ways to use kiln — pick based on the caller's language

1. **The CLI**, from a terminal — `kiln init`, `kiln run`, `kiln serve`, etc. Manages agent projects
   as files on disk.
2. **The SDK**, imported directly — `import { createKiln } from "@abhishekvardanbotta/kiln"`. Runs
   in-process inside a Node/TypeScript backend, no subprocess or HTTP hop. This is what you want if the
   caller's backend is already Node/TS.

If the caller's backend is **not** Node/TS (Python, Go, anything else), run `kiln serve` as a sidecar
process and call it over HTTP — see "Serving over HTTP" below.

## Quickstart: build and run an agent from zero

```bash
# One kiln init project can hold unlimited agents — this is not "one agent, one project".
kiln init my-agents
cd my-agents
kiln agent add forecaster        # scaffolds src/agents/forecaster.ts
kiln agent list                  # see every agent this project defines
```

Write the agent (`src/agents/forecaster.ts`):

```ts
import { defineAgent } from "@abhishekvardanbotta/kiln";
import { z } from "zod";

const ForecastSchema = z.object({
  city: z.string(),
  temperatureC: z.number(),
  summary: z.string(),
});

export default defineAgent({
  name: "forecaster",
  provider: "ollama",       // "openai" | "groq" | "ollama" — required, no default
  model: "llama3.2",        // defaults to "gpt-4o-mini" if omitted (only sensible for provider: "openai")
  async execute(ctx) {
    const city = (ctx.input as { city: string }).city;
    return ctx.ai.object({
      messages: [{ role: "user", content: `Give a short weather forecast for ${city}.` }],
      schema: ForecastSchema,
    });
  },
});
```

Run it:

```bash
kiln validate                                  # checks agent.yaml + project structure
kiln run my-agents:forecaster --query "Tokyo"   # runs one agent standalone (needs it installed first — see below)
kiln logs <runId>                               # replay that run's full event timeline
```

To actually run it standalone via the CLI, package and install it first (kiln resolves *installed*
agents by name, not arbitrary paths):

```bash
kiln pack                                       # -> my-agents-0.1.0.agent
kiln install my-agents-0.1.0.agent
kiln run my-agents:forecaster --query "Tokyo"
```

`kiln run` accepts multiple targets, `--all` (every installed package), and `--concurrency <n>`
(default 20, also settable process-wide via the `KILN_CONCURRENCY` env var):

```bash
kiln run my-agents                # runs every agent this package defines, concurrently
kiln run pkgA pkgB:someAgent --concurrency 50
kiln run --all
```

## The `ctx` object — what `execute(ctx)` gets for free

```ts
interface AgentContext<TInput = unknown> {
  readonly input: TInput;
  readonly runId: string;
  readonly ai: BoundAI;
  readonly tools: Record<string, (input: unknown) => Promise<unknown>>;
  readonly memory: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  log(event: string, data?: unknown): void;
}
```

`ctx.ai` (`BoundAI`) — already bound to the agent's configured `provider`/`model`:

- `ctx.ai.chat({ messages, ... })` — raw chat completion.
- `ctx.ai.stream({ messages, ... }, onChunk)` — streamed chat completion.
- `ctx.ai.json({ messages, ... })` — chat with `response_format: json_object`.
- `ctx.ai.run({ messages, maxSteps? })` — **the tool-calling loop.** Sends messages, and if the model
  requests a tool call, executes it (against `ctx.tools`/the agent's declared `tools`) and feeds the
  result back automatically, looping until a final answer or `maxSteps` (default 4) is hit.
- `ctx.ai.object({ messages, schema, maxAttempts? })` — **self-correcting structured output.** Writes
  the schema instruction into the prompt, validates the response against a zod `schema`, and on failure
  feeds the exact validation error back to the model and retries (default `maxAttempts`: 3). Returns
  fully typed data, or throws — never silently returns `{ raw: "..." }`.

`ctx.tools.<name>(input)` — calls a tool the agent declared (see below), by its `name`.

`ctx.memory.get/set` — simple key/value persistence via `MemoryManager`.

`ctx.log(event, data?)` — emits an event onto the run's recorded timeline (`kiln logs <runId>` reads
these back).

## Tools

```ts
import { defineTool } from "@abhishekvardanbotta/kiln";
import { z } from "zod";

const getForecast = defineTool({
  name: "getForecast",
  description: "Fetch a real weather forecast for a city.",
  parameters: z.object({ city: z.string() }),
  async execute(input, ctx) {
    // input is already validated against `parameters` before this runs.
    return { city: input.city, temperatureC: 21, summary: "Clear skies." };
  },
});

export default defineAgent({
  name: "forecaster",
  provider: "ollama",
  model: "llama3.2",
  tools: [getForecast],
  async execute(ctx) {
    // Call it directly — validated the same way as when the model calls it via ctx.ai.run():
    const forecast = await ctx.tools.getForecast({ city: "Tokyo" });
    // ...or let the model decide to call it, via the tool-calling loop:
    return ctx.ai.run({ messages: [{ role: "user", content: "What's the weather in Tokyo?" }] });
  },
});
```

`parameters` may be a zod schema (validated locally before `execute` runs) or a raw JSON Schema object
(skips local validation — this is how MCP tools work, see below).

## MCP (Model Context Protocol)

```ts
import { connectMCP } from "@abhishekvardanbotta/kiln";

const mcp = await connectMCP({ command: "npx", args: ["-y", "@some/mcp-server"] });
// mcp.tools is Tool[] — pass straight into defineAgent, they compose with ctx.ai.run() exactly like
// hand-written tools.

export default defineAgent({
  name: "agent-with-mcp",
  provider: "openai",
  tools: [...mcp.tools],
  async execute(ctx) {
    return ctx.ai.run({ messages: [...] });
  },
});

// Always close when done — an unclosed MCP server leaves its child process running:
await mcp.close();
```

## Orchestration — running multiple agents as a pipeline

This is the actual multi-agent primitive. Use it whenever one agent's output feeds another's input, or
whenever you want several independent agents to run concurrently with real dependency ordering.

```ts
import { createKiln, type PipelineRunContext } from "@abhishekvardanbotta/kiln";

const kiln = createKiln();

const result = await kiln.orchestrate(
  [
    { id: "forecaster", agent: { directory: "./my-agents", agentName: "forecaster" }, input: { city: "Paris" } },
    {
      id: "advisor",
      agent: { directory: "./my-agents", agentName: "advisor" },
      dependsOn: ["forecaster"],
      retries: 2,
      // Type the callback param explicitly — `unknown` in the PipelineStep union otherwise swallows inference:
      input: (ctx: PipelineRunContext) => ({ forecast: ctx.outputs.forecaster }),
    },
  ],
  {
    concurrency: 20,
    onStep: (id, res, attempt) => console.log(id, res.status, attempt),
  },
);

// result.outputs.<stepId>  -> that step's validated output
// result.steps             -> per-step outcome: "succeeded" | "failed" | "skipped" (skipped = a dependency failed)
```

`agent` in a `PipelineStep` can be either a file-based reference (`{ directory, agentName? }`) or an
**inline** `defineAgent(...)` result — no folder, no `kiln init`, define and orchestrate in one file.
Mix both freely in the same pipeline. Steps with no `dependsOn` run immediately; independent branches
run concurrently up to `options.concurrency`; a step whose dependency fails is marked `"skipped"`
instead of running with missing input — one bad agent never silently corrupts a downstream one.

`kiln.runInlineAgent(definition, input)` runs a single inline `defineAgent(...)` the same way, without
orchestration — useful for a one-off agent with no project folder at all.

## Serving over HTTP (for non-Node backends)

```bash
kiln serve --port 4500
```

Endpoints (Fastify, docs at `/docs`):

- `GET /agents` — every installed package and the agents it defines
- `POST /agents/:name/run` — run one (`name` is `package` or `package:agent`); `?sync=true` blocks for the result
- `POST /agents/run-batch` — `{ names, input, concurrency? }`
- `GET /runs/:runId` — status/result of a recorded run
- `GET /runs/:runId/events` — SSE stream of that run's live events

A Python/FastAPI (or any other language) backend calls in purely over these HTTP endpoints — no kiln
SDK needed on that side.

## Other CLI commands worth knowing

- `kiln pack` / `kiln install <file>.agent` — build and install a distributable `.agent` archive (a zip
  of the project + `agent.yaml` manifest).
- `kiln search` / `kiln publish` / `kiln login` / `kiln logout` — kiln's own package registry commands.
  **This registry is currently mocked** (no real network calls) — don't imply to a user that
  `kiln publish` puts a package on a public registry today.
- `kiln doctor` — environment/config sanity check.
- `kiln logs <runId>` — replay one run's full event timeline. This is the debugging story for "one
  agent failed inside a 200-agent batch": every run gets a `runId`, and its timeline survives after the
  process exits (written to `~/.kiln/cache/runs/<runId>.json`).

## Provider setup

| provider | env var | notes |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | base URL `https://api.openai.com/v1` |
| `groq` | `GROQ_API_KEY` | base URL `https://api.groq.com/openai/v1` |
| `ollama` | `OLLAMA_HOST` (optional) | defaults to `localhost:11434`; give it bare `host:port` the way Ollama's own docs do — kiln normalizes it to the right `/v1` URL itself |
| `gemini`, `claude` | — | **stub only**, throws `"<name> is not implemented yet."` |

## Common mistakes to avoid

- Don't call `kiln run <package>:<agent>` on an agent that was never `kiln install`ed — install (or
  point at it via `directory` in the SDK) first.
- Don't type a `PipelineStep`'s `input` callback as `(ctx) => ...` without annotating `ctx:
  PipelineRunContext` — the union type swallows inference otherwise.
- Don't assume `defineAgent` has a default `provider` — it's required and throws
  `"Agent \"<name>\" does not declare a provider."` if omitted.
- Don't leave an MCP connection open — always `await mcp.close()`.
- Don't recommend `gemini`/`claude` as working providers — they're stubs.
