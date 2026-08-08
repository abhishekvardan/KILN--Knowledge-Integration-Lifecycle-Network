# kiln

A CLI + SDK for building and orchestrating AI agents. Real provider calls (OpenAI, Groq, Ollama), an
automatic tool-calling loop, self-correcting structured output, MCP support, and a DAG orchestrator with
concurrency pooling and cascading failure isolation — so you write agent logic, not infrastructure.

**→ [KILN.md](./KILN.md) is the full reference** — written so an AI assistant can read it once and use
kiln correctly. Point Claude/Cursor/whatever you use at that file; this README is just the map.

## Install

```sh
npm install @abhishekvardanbotta/kiln     # as a dependency, imported via createKiln()
npm install -g @abhishekvardanbotta/kiln  # as a CLI, exposes the `kiln` command
```

## 60-second tour

```sh
kiln init my-agents && cd my-agents   # one project holds unlimited agents
kiln agent add forecaster              # scaffolds src/agents/forecaster.ts
kiln validate && kiln pack && kiln install my-agents-0.1.0.agent
kiln run my-agents:forecaster --query "Tokyo"
kiln logs <runId>                      # replay exactly what happened
kiln serve --port 4500                 # REST + SSE over HTTP for any backend language
```

Or skip the CLI entirely and embed it in a Node/TypeScript backend:

```ts
import { createKiln } from "@abhishekvardanbotta/kiln";

const kiln = createKiln();
await kiln.orchestrate([
  { id: "forecaster", agent: { directory: "./my-agents", agentName: "forecaster" }, input: { city: "Paris" } },
  { id: "advisor", dependsOn: ["forecaster"], agent: { directory: "./my-agents", agentName: "advisor" },
    input: (ctx) => ({ forecast: ctx.outputs.forecaster }) },
]);
```

See **[KILN.md](./KILN.md)** for `defineAgent`/`defineTool`/`connectMCP`, the `ctx.ai` API
(`chat`/`stream`/`json`/`run`/`object`), the orchestrator, the HTTP server's endpoints, provider setup,
and common mistakes to avoid.

## Status

Providers: `openai` and `groq` (real, via a shared OpenAI-compatible adapter) and `ollama` (real, local)
work today. `gemini` and `claude` are still stub adapters. Kiln's own package registry commands
(`search`/`publish`/`login`) are currently mocked — no real network calls.

## License

MIT
