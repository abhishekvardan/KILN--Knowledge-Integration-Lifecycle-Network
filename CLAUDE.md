# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

KILN CLI (npm package `@abhishekvardanbotta/kiln`, binary name `kiln`) — a command-line tool for creating,
validating, packaging, and running local AI-agent packages (`.agent` files). The registry (`kiln search`,
`kiln publish`, `kiln login`) is intentionally mocked/local-only so package flows work without network access.
This repo **is** the CLI itself, not a project built with it.

## Commands

```sh
npm install
npm run dev -- <command> [...args]   # run CLI from source via tsx (src/index.ts)
npm run build                        # tsc -p tsconfig.json -> dist/
npm run start                        # node dist/index.js (run built CLI)
```

There is no lint or test script defined in `package.json` — no test runner is wired up.

Typical package workflow, exercised end-to-end via `npm run dev --`:

```sh
kiln init                                     # scaffold a new agent project in an empty dir
kiln agent add <name>                         # add ANOTHER agent to that same project — no separate kiln init
kiln agent list                               # list the agents the current project defines
kiln validate                                 # validate agent.yaml + required directories
kiln pack                                     # zip into <name>-<version>.agent (all its agents included)
kiln install <name>-<version>.agent           # install into ~/.kiln/agents
kiln run <target...> [--all] [--concurrency N]  # target = "package" (every agent in it) or "package:agent" (one)
kiln logs <runId>                             # replay one run's recorded event timeline (debugging)
kiln serve [--port 3000]                      # HTTP API (run/status/SSE) for another backend to call
kiln inspect <name>                           # inspect an installed package or archive/dir
kiln unpack <archive> <dest>                  # extract with Zip Slip protection
kiln lint                                     # scaffold quality score (errors/warnings)
kiln list | remove | search | publish | login | logout | doctor | update | uninstall
kiln template | agent create|validate | workflow   # unrelated legacy template-gallery commands, see below
kiln cache | config                           # system subcommands
```

A Node backend can also skip the CLI/HTTP entirely and `import { createKiln } from "@abhishekvardanbotta/kiln"`
(`src/sdk.ts`) for `runAgent`/`runInlineAgent`/`runBatch`/`orchestrate` in-process — `runInlineAgent` and
`orchestrate` don't need a package directory at all, just an in-hand `defineAgent(...)` object. The SDK also
exports `ai.object()`'s type, `definePrompt`/`combinePrompts`, and `connectMCP` (MCP client — see below).

Global config/state lives at `~/.kiln` (`config.json`, `installed.json`, `agents/`, `cache/`, `templates/`),
managed by `ConfigService` (`src/services/ConfigService.ts:11`). `program.hook("preAction", ...)` in
`src/index.ts` always calls `config.initialize()` before any command runs.

## Architecture

### Two systems: package lifecycle vs. agent execution

1. **Package system** (`src/services/{PackageService,ConfigService,RegistryService,AgentManifest}.ts`) — the
   full lifecycle of `.agent` packages: scaffold (`kiln init`), Zod-validated `agent.yaml` manifests
   (`AgentManifest.ts`), zip packaging via `archiver`, installation to `~/.kiln/agents`, and archive extraction
   via `unzipper` with explicit Zip Slip path-traversal checks (`PackageService.extractArchive`).
   `RuntimeService`/`RuntimeEngine`/`WorkflowManager`/`AgentManager`/`ConnectorManager`/`CheckpointManager`
   still exist and still work (the legacy `runtime: prompt` / `prompts/system.md` manifest-driven path from
   `docs/runtime.md`) but nothing in `src/commands/*` wires them up anymore — `kiln run` no longer touches them.

2. **Agent execution** (`src/runtime/AgentRuntime.ts` + `src/foundation/*`) — the real, working path.
   `kiln init` scaffolds a `defineAgent(...)` (`src/foundation/agents/defineAgent.ts`) default export.
   `AgentRuntime.run(packageDirectory, input, options)` dynamically `import()`s that file **in-process** (no
   subprocess spawn — see below), builds an `AgentContext` (`ctx.ai` bound to the agent's configured provider,
   `ctx.tools`, `ctx.memory`, `ctx.log`), calls `execute(ctx)`, and always resolves to `{status:"succeeded"|
   "failed", ...}` — failures are caught, never thrown, so one bad agent can't take down a batch of others.
   `BatchRunner` (`src/runtime/BatchRunner.ts`) runs many `AgentRuntime.run` calls through `ConcurrencyPool`
   (`src/runtime/ConcurrencyPool.ts`, cap via `KILN_CONCURRENCY`, default 20) — this is what `kiln run --all`
   and `POST /agents/run-batch` (`src/server/createServer.ts`) both call.

### `AgentRuntime.load`/`runDefinition` and `Orchestrator` — the SDK's real orchestration primitive

`AgentRuntime.run()` is now a thin wrapper: `load(packageDirectory, agentName)` resolves a file to an
`AgentDefinition`, and `runDefinition(definition, input, options)` executes an already-in-hand definition —
no file, no directory, no `kiln init` required. `defineAgent(...)` called inline in any script can be run
directly via `runDefinition`/`createKiln().runInlineAgent()`.

`src/runtime/Orchestrator.ts` (`createKiln().orchestrate(steps, options)` in the SDK) builds on top of that:
given a list of `{ id, agent, input, dependsOn?, retries?, isValid? }` steps (each `agent` either an inline
`AgentDefinition` or a `{ directory, agentName }` file reference), it topologically schedules them —
independent branches run concurrently through a `ConcurrencyPool`, a step whose dependency failed is marked
`"skipped"` (cascading through its own dependents) rather than run with missing input, and each step retries
against a pluggable validity check (default: rejects `{ raw: "..." }`, the parse-failure convention used
throughout the example agents). This is the actual "orchestration" primitive — a hand-written
`await stepA(); await stepB(resultFromA)` sequence gets none of concurrency, cascading failure isolation, or
retry for free; `orchestrate()` does. See `interesting/orchestrator/` in the repo root's sibling projects for
a real 4-step dependency graph and a synthetic concurrency proof (`concurrency-proof.ts`, isolates kiln's own
scheduling overhead — ~14ms for 4 steps — from LLM latency by using artificial delays instead of real model
calls).

### Ergonomics for agent authors: `ai.object()`, `definePrompt()`, `connectMCP()`

Three additions specifically aimed at "less code to write a working agent," all proven against real
Ollama calls / a real MCP server, not just type-checked:

- **`ctx.ai.object({ messages, schema, maxAttempts? })`** (`AgentRuntime.createContext`'s `ai.object`) —
  structured output with a zod schema. Writes its own schema instruction into the prompt, calls
  `provider.json()`, `schema.safeParse()`s the result, and on failure feeds the validation error back and
  retries (default 3 attempts) before throwing. This replaces the hand-written "respond with ONLY JSON of
  this exact shape" system-prompt text + `JSON.parse(stripCodeFence(...))` + `{ raw }`-fallback pattern
  every example agent in this repo's sibling demo projects used before this existed. One real bug found and
  fixed while building it: dropping a raw JSON Schema into the prompt makes smaller models (llama3.2)
  literally echo the schema back as if it were the answer — the instruction now explicitly distinguishes
  "the schema" from "an instance of it" with a worked example, which fixed it.
- **`definePrompt({ persona?, task?, constraints?, examples?, outputFormat? })`**
  (`src/foundation/prompts/definePrompt.ts`) — composes a system prompt from named sections instead of ad
  hoc string concatenation. Returns a plain string; combine multiple with `combinePrompts(...)`.
- **`connectMCP({ command, args?, env? })`** (`src/foundation/mcp/connectMCP.ts`, wraps the official
  `@modelcontextprotocol/sdk`) — spawns an MCP server over stdio and returns `{ tools, close }` where
  `tools` are real kiln `Tool[]` objects, ready to drop straight into `defineAgent({ tools: [...mcp.tools] })`
  with zero glue code. MCP tools declare JSON Schema, not zod, so `Tool.parameters` now accepts either
  (`ZodType | JsonSchema` — see `runtime/interfaces/Tool.ts`); `ToolManager.invoke` only runs local zod
  validation when `parameters instanceof ZodType`, and `AgentRuntime`'s `toolDefinitionsFor` passes a raw
  JSON Schema straight through to the provider instead of forcing it through `zodToJsonSchema`. Always
  `await mcp.close()` — an unclosed connection leaves the server subprocess running. `close()` itself
  waits an extra ~150ms after the underlying client closes: the close() promise used to resolve slightly
  before the child process handle finished tearing down at the OS level, so `await mcp.close();
  process.exit()` — an entirely natural thing to write — could race that teardown and crash the whole
  process with a native libuv assertion (`UV_HANDLE_CLOSING`, uncatchable from JS), reproduced 100% of the
  time before the fix and 0% of the time after across repeated runs.

Also fixed: `OllamaProvider` used to read `OLLAMA_HOST` as a literal base URL, but Ollama's own convention
for that variable is bare `host:port` with no scheme and no `/v1` — silently 404ing for anyone who set it
the way Ollama documents. `resolveOllamaBaseURL()` in `ProviderManager.ts` now normalizes it.

### One package, many agents

A package is not one agent — `kiln init` scaffolds the first agent at `src/agents/<project-name>.ts`, and
`kiln agent add <name>` (`PackageService.addAgent`) drops another `src/agents/<name>.ts` into the *same*
project, no second `kiln init`/`pack`/`install` needed. `kiln pack` zips all of `src/` as-is, so one `.agent`
archive and one `kiln install` can carry hundreds of agents. (Legacy single-agent packages using `src/agent.ts`
directly — anything scaffolded before this existed — still work unchanged.)

Addressing: a bare `kiln run <package>` (or an installed-agent HTTP call with no `:agent` suffix) runs **every**
agent that package defines, concurrently, through the same `ConcurrencyPool` as any other batch — this is what
lets a single `kiln init` project scale to running 200 agents in one shot. `kiln run <package>:<agent>` (same
`pkg:agent` syntax over HTTP: `POST /agents/pkg:agent/run`) targets exactly one. All of this expansion happens
in `AgentRuntime.listAgents` (discovers `src/agents/*.ts`) + `src/runtime/resolveTargets.ts`
(`expandRunTargets`, shared by `kiln run` and `POST /agents/run-batch`).

Two correctness details worth knowing if you touch this code:
- `resolveTargets.expandRunTargets` never throws for a bad spec (not installed, package with zero agents, ...)
  — it pushes a `BatchTarget` with `resolutionError` set instead, and `BatchRunner` turns that into a normal
  `{status:"failed"}` result. This was a real bug: an eager throw here used to abort an entire `--all` run over
  one unrelated broken package.
- `AgentRuntime`'s per-package `node_modules/@kiln/sdk` shim + `package.json` self-heal (see below) is memoized
  per directory (`shimPromises` map) because up to `KILN_CONCURRENCY` agents from the *same* package now run
  concurrently against the *same* directory — without the memoization, concurrent first-runs raced to write
  the same files and could corrupt `package.json` (`Invalid package config ...`).

### Providers

`ProviderManager` (`src/runtime/ProviderManager.ts`) registers real adapters for `openai`, `groq`, and `ollama`
— all three are `OpenAICompatibleProvider` instances (`src/foundation/providers/OpenAICompatibleProvider.ts`,
plain `fetch`, no SDK dependency) pointed at each vendor's `/chat/completions`-shaped endpoint with a different
`baseURL`/API-key env var. `gemini` and `claude` are still `StubProvider` (reject with a clear "not implemented
yet" `KilnError`) — same interface, trivial to fill in the same way if needed. Zod tool schemas are converted to
JSON Schema for the wire format via `zod-to-json-schema`. `BoundAI.run({ messages })` (built in `AgentRuntime
.createContext`) auto-loops tool calls up to `maxSteps` so agent authors don't hand-roll the call → execute →
feed-back loop.

### The `@kiln/sdk` bare specifier and why a package.json gets written into every agent project

Scaffolded/installed agent directories are **not** npm projects — nothing ever runs `npm install` inside them —
yet `src/agent.ts` imports `defineAgent` from the bare specifier `"@kiln/sdk"`. `AgentRuntime.run()` makes this
resolve by writing two things into the target directory before each run, idempotently (`ensureSdkShim`):
a `node_modules/@kiln/sdk/index.js` shim that re-exports kiln's own `dist/sdk.js` (or `src/sdk.ts` when running
from source), and — if missing — a minimal `package.json` with `"type": "module"`. The `package.json` isn't
optional polish: without it Node treats `.ts` files as CommonJS, and requiring the shim's ESM graph synchronously
fails with `ERR_VM_MODULE_LINK_FAILURE` ("module is not linked"). `AgentRuntime` also calls `tsx`'s `register()`
(`tsx/esm/api`) once per process so `.ts` import works at all regardless of whether kiln itself is running via
`tsx` (`npm run dev`) or as built `dist/index.js` — this is also why `tsx` is a runtime `dependency`, not a
`devDependency`.

### `src/foundation/*`

`defineAgent`/`defineTool`/`defineConnector`/`defineProvider` are real, small factory functions (not stubs) that
build plain descriptor objects — they don't touch the registry or a provider at define-time. The live binding
(resolving a provider, wiring `ctx.tools` to a per-run scoped `ToolManager`, etc.) happens later, inside
`AgentRuntime.createContext`, once per run — keeping `defineAgent` itself dependency-free and safe to import
from an isolated agent module.

### Package format

- Packages use the `.agent` extension (zip archives); manifest is `agent.yaml` (spec: `docs/spec.md`).
- Required fields: `name` (kebab-case), `version` (semver), `description`. `runtime` and `entrypoint` default
  to `prompt` / `prompts/system.md` for backward compatibility but should be set explicitly in new packages.
  Schema enforced by `AgentManifestSchema` (`src/services/AgentManifest.ts`).
  A valid project also requires `prompts/`, `workflows/`, `src/` directories and a `README.md`
  (`PackageService.validateProject`).
- `kiln init` scaffolds a much richer structure than the manifest strictly requires: `src/agent.ts` (the
  `defineAgent` entrypoint actually invoked by `AgentRuntime`), `tools/`, `connectors/`, `knowledge/`,
  `memory/`, `tests/`, and a `.kiln/` directory of YAML runtime config (`runtime.yaml`, `providers.yaml`,
  `observability.yaml`, etc.) plus `.kiln/skills/*.md` — Claude-oriented instruction docs generated per
  scaffolded project (see `src/services/SkillTemplates.ts`). This repo's own `.kiln/` directory is one such
  self-generated artifact from dogfooding `kiln init` on itself, not hand-maintained documentation — treat it
  as a template output sample, not a source of truth about this repo.

### Command registration pattern

`src/index.ts` is the composition root: it instantiates every service/manager once, then calls one
`register*Command(program, ...deps)` function per command (`src/commands/*.ts`, plus `src/commands/package/*`
and `src/commands/system/*` for nested subcommands). Commands take their dependencies as explicit constructor/
function arguments — there is no DI container or global singleton lookup. Follow this pattern for new commands:
add a `registerXCommand` export, wire its dependencies where the others are constructed, and register it in
`src/index.ts`.

### Errors and output

- Throw `KilnError` (`src/utils/errors.ts`) for user-facing failures; `toErrorMessage()` unwraps it for display.
  Commands generally catch at the action boundary and call `output.error(...)` / set `process.exitCode = 1`
  rather than letting exceptions escape.
- `src/utils/output.ts` / `src/utils/packageView.ts` centralize chalk-styled console formatting — reuse these
  rather than calling `console.log` with ad-hoc styling in new commands.

### Non-source directories at repo root

`package-smoke-test*/`, `runtime-smoke-test/`, `unpack-smoke-test/`, `init-v06-smoke-parent/` are manually
created fixtures from running `kiln` subcommands against itself during development (scaffolded packages, built
`.agent` archives, etc.) — not build output, not test infrastructure, safe to ignore when reasoning about
source architecture.