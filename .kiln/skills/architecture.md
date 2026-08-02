# KILN Architecture

KILN is both a **CLI tool** and a **Runtime Host** for AI agent projects. This document describes the architecture of the `agenthub-cli` codebase and the contract it enforces on every project it scaffolds.

---

## 1. Two-Layer Model

KILN enforces a strict two-layer model:

| Layer | Location | Owner | Purpose |
|---|---|---|---|
| **Business Logic** | `src/` | Developer | Agent decisions, domain code, types, tests |
| **Infrastructure** | `.kiln/` | Framework | Runtime config, providers, memory, observability |

**Rule**: Logic never leaks into `.kiln/`. Configuration never leaks into `src/`.

---

## 2. CLI Source Structure (`agenthub-cli/src/`)

```
src/
  commands/
    init.ts          kiln init — scaffolds a new agent project
    validate.ts      kiln validate — validates manifest and structure
    run.ts           kiln run — prepares an execution plan (no AI invoked)
    dev.ts           kiln dev — starts the Runtime Host HTTP server
    pack.ts          kiln pack — creates a .agent distributable archive
    install.ts       kiln install — installs a .agent package locally
  services/
    PackageService.ts      Scaffold, pack, install, inspect logic
    SkillTemplates.ts      Generates .kiln/skills/ documentation for new projects
    AgentManifest.ts       Zod schema and type for agent.yaml
    RuntimeService.ts      Orchestrates runtime startup and shutdown
    RegistryService.ts     Discovers and registers agents, workflows, tools, connectors
  runtime/
    server.ts        Fastify HTTP server (routes, Swagger, SSE)
    executor.ts      Workflow execution engine (compiles YAML → LangGraph)
    registry.ts      In-memory runtime registry
    middleware.ts    Request validation, auth, observability hooks
  foundation/
    defineAgent.ts   Public SDK: defineAgent()
    defineWorkflow.ts
    defineTool.ts
    defineConnector.ts
    defineProvider.ts
  utils/
    errors.ts        KilnError and error hierarchy
    fs.ts            Safe filesystem helpers
    logger.ts        Structured logger (pino)
  types.ts           Shared TypeScript interfaces
  index.ts           CLI entry point
```

---

## 3. Scaffolded Project Structure

When `kiln init <name>` runs, it creates:

```
<name>/
  agent.yaml            Metadata only (name, version, description, author, license)
  src/
    agent.ts            defineAgent() entrypoint — developer-owned
    index.ts            Re-exports agent
    types.ts            AgentInput / AgentOutput interfaces
  prompts/
    system.md           Permanent agent identity
    developer.md        Engineering constraints
    task.md             Task-specific instructions
    examples.md         Few-shot examples
    safety.md           Safety and escalation boundaries
    variables.yaml      {{variableName}} substitutions
  workflows/
    main.yaml           Default orchestration graph
  tools/                Reusable tool implementations
  connectors/           External service integrations
  knowledge/
    project.md          Domain facts and context
    coding-guidelines.md  Conventions
  memory/               Memory adapter config
  tests/
    agent.test.ts       Behavior tests
  .kiln/
    config.yaml         Project name binding
    runtime.yaml        Provider, memory, events, checkpoints flags
    providers.yaml      AI provider definitions
    observability.yaml
    memory.yaml
    checkpoints.yaml
    events.yaml
    skills/             AI assistant specification (this directory pattern)
      SKILL.md
      architecture.md
      runtime.md
      ...
```

---

## 4. The Execution Lifecycle

### `kiln run <name>` (Planning Only)

1. Load `agent.yaml` → validate with `AgentManifestSchema`
2. Load `.kiln/runtime.yaml` → build `RuntimeConfig`
3. Load `workflows/main.yaml` → compile to execution graph
4. Resolve providers from `.kiln/providers.yaml`
5. Bind tools and connectors from `tools/` and `connectors/`
6. **Output**: an execution plan JSON — no AI API is called

### `kiln dev` (Runtime Host)

1. All steps above, plus:
2. Start Fastify HTTP server on `localhost:4000`
3. Expose `GET /health`, `GET /ready`, `GET /agents`, `GET /workflows`, `GET /metrics`
4. Expose `POST /invoke` (request/response) and `POST /stream` (SSE)
5. Keep registry hot-reloaded on file changes

---

## 5. Public SDK Contract

The only API surface exposed to developers is:

```typescript
import { defineAgent }    from "@kiln/sdk";
import { defineWorkflow } from "@kiln/sdk";
import { defineTool }     from "@kiln/sdk";
import { defineConnector } from "@kiln/sdk";
import { defineProvider } from "@kiln/sdk";
```

**Never** export LangGraph nodes, LangChain objects, or Fastify internals from `@kiln/sdk`.

---

## 6. Common Pitfalls

| Mistake | Correct Approach |
|---|---|
| Putting provider API keys in `agent.yaml` | Use env vars; reference in `.kiln/providers.yaml` |
| Calling LangGraph APIs from agent code | Use `defineWorkflow()` — KILN compiles it |
| Global state in `src/agent.ts` | Use `ctx.state` from the execution context |
| Hardcoded model names in code | Always via `.kiln/providers.yaml` |
| Skipping `kiln validate` after structural changes | Always validate before `kiln pack` |
