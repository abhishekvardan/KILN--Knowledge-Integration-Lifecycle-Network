# KILN Runtime Host

The KILN Runtime Host is the execution engine started by `kiln dev`. It transforms a KILN project into a live HTTP application server capable of executing real AI agent workflows.

> [!IMPORTANT]
> The Runtime Host is an **internal** implementation. Developers interact with it only through the HTTP API and the `defineAgent()` / `defineWorkflow()` SDK. LangGraph and LangChain are never exposed to the user.

---

## 1. Starting the Runtime Host

```bash
kiln dev
```

Starts the server at `http://localhost:4000` by default.

Options:
```bash
kiln dev --port 3000
kiln dev --host 0.0.0.0 --port 8080
kiln dev --watch   # hot-reload on file changes
```

---

## 2. HTTP Server (Fastify)

The server is built on **Fastify** with the following plugins:

| Plugin | Purpose |
|---|---|
| `@fastify/swagger` | OpenAPI 3.x schema generation |
| `@fastify/swagger-ui` | Serves Swagger UI at `/docs` |
| `@fastify/cors` | Cross-origin request support |

### Exposed Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "healthy" }` — always 200 |
| `GET` | `/ready` | Returns `{ status: "ready" }` once registry is loaded |
| `GET` | `/agents` | Lists all discovered agents |
| `GET` | `/workflows` | Lists all discovered workflows |
| `GET` | `/metrics` | Returns runtime observability counters |
| `POST` | `/invoke` | Executes a workflow (request/response) |
| `POST` | `/stream` | Executes a workflow with Server-Sent Events |

---

## 3. Runtime Registry

On startup, KILN performs **automatic discovery** of all project artifacts:

1. **Agents** — scans `src/` for `defineAgent()` exports
2. **Workflows** — parses all `workflows/*.yaml` files
3. **Prompts** — loads all layers from `prompts/`
4. **Tools** — discovers `tools/*.ts` with `defineTool()` exports
5. **Connectors** — discovers `connectors/*.ts` with `defineConnector()` exports
6. **Providers** — reads `.kiln/providers.yaml`

The registry is stored in memory and served via `GET /agents` and `GET /workflows`.

---

## 4. Execution Context (`ctx`)

Every agent execution receives a typed `ctx` object:

```typescript
interface ExecutionContext {
  executionId: string;          // Unique run ID (UUID v4)
  workflowName: string;         // Name of the active workflow
  input: Record<string, unknown>; // Raw input from /invoke or /stream
  state: Map<string, unknown>;  // Mutable runtime state — use instead of globals
  tools: BoundToolRegistry;     // Resolved tools for this execution
  connectors: BoundConnectorRegistry;
  memory: MemoryAdapter;        // Short/long-term memory configured in .kiln/memory.yaml
  events: EventEmitter;         // Emit events consumed by /stream SSE
  checkpoints: CheckpointStore; // Pause/resume/rollback capability
  logger: Logger;               // Structured logger (pino)
}
```

> [!WARNING]
> Never use module-level global variables inside agents. Always read/write via `ctx.state`. This ensures concurrent executions do not share state.

---

## 5. Agent Lifecycle

Within a single `POST /invoke` or `POST /stream` call, each agent goes through:

```
PENDING → PLANNING → EXECUTING → TOOL_CALLING → COMPLETED | FAILED
```

Events emitted to `/stream` at each transition:

| Event | Payload |
|---|---|
| `workflow.started` | `{ executionId, workflow, input }` |
| `agent.started` | `{ executionId, agent }` |
| `tool.called` | `{ executionId, tool, input }` |
| `provider.invoked` | `{ executionId, provider, model, tokens }` |
| `agent.completed` | `{ executionId, agent, output }` |
| `workflow.completed` | `{ executionId, output, durationMs }` |

---

## 6. Middleware Pipeline

Requests flow through this middleware stack before reaching route handlers:

```
Request
  → CORS check
  → Request ID injection
  → Schema validation (Zod)
  → Auth check (if configured)
  → Rate limiter (if configured)
  → Route handler
  → Observability hook (emit metrics)
  → Response serialisation
Response
```

---

## 7. Checkpoints

For long-running workflows, checkpoints allow pause and resume:

```typescript
// Inside an agent
await ctx.checkpoints.save("step-label", partialState);

// Resume from a previous checkpoint
const state = await ctx.checkpoints.restore("step-label");
```

Checkpoint storage backend is configured in `.kiln/checkpoints.yaml`.

---

## 8. Hot Reload (Watch Mode)

`kiln dev --watch` uses `chokidar` to watch:
- `src/**/*.ts`
- `workflows/**/*.yaml`
- `prompts/**/*.md`
- `tools/**/*.ts`
- `connectors/**/*.ts`
- `.kiln/*.yaml`

On change: re-discovers artifacts, rebuilds the registry, re-compiles LangGraph graphs. Running executions complete against the old graph; new invocations use the new graph.

---

## 9. Configuration

Runtime Host behaviour is configured entirely in `.kiln/`:

| File | Controls |
|---|---|
| `runtime.yaml` | Provider, memory, events, checkpoints, observability flags |
| `providers.yaml` | AI provider definitions and default model |
| `memory.yaml` | Memory adapter and TTL |
| `checkpoints.yaml` | Checkpoint store backend |
| `events.yaml` | Event bus configuration |
| `observability.yaml` | Metrics and tracing |

**Never configure the Runtime Host from within `src/agent.ts`.**
