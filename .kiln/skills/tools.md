# Tools

Tools are the mechanism through which agents take **concrete actions** in the external world. KILN uses LangChain's tool-calling protocol internally, but developers interact only with `defineTool()`.

> [!IMPORTANT]
> Tools must be explicitly declared and granted to agents. There is no implicit access to any tool. KILN enforces permission-based tool resolution at runtime.

---

## 1. Anatomy of a Tool

```typescript
// tools/read-file.ts
import { defineTool } from "@kiln/sdk";
import { z } from "zod";
import { readFile } from "node:fs/promises";

export default defineTool({
  name: "read-file",
  description: "Reads a file from the local filesystem and returns its contents as a string.",

  // Permissions this tool requires — enforced by the runtime
  permissions: ["fs:read"],

  // Zod schema for input validation — also used to generate the LLM function signature
  schema: z.object({
    path: z.string().describe("Absolute or relative path to the file"),
    encoding: z.enum(["utf-8", "base64"]).default("utf-8").describe("File encoding"),
  }),

  // The implementation — runs in a sandboxed execution context
  async execute(input, ctx) {
    const content = await readFile(input.path, { encoding: input.encoding });
    return { content, path: input.path, sizeBytes: Buffer.byteLength(content) };
  },
});
```

---

## 2. Tool Requirements

Every tool MUST declare:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `name` | `string` | ✅ | Unique identifier; used by agents to request a tool |
| `description` | `string` | ✅ | Sent to the LLM to explain what the tool does |
| `permissions` | `string[]` | ✅ | Capabilities required (enforced by runtime) |
| `schema` | `z.ZodObject` | ✅ | Input schema — validated before `execute()` is called |
| `execute` | `async fn` | ✅ | The implementation; receives validated `input` and `ctx` |

---

## 3. Permission Model

KILN resolves tools at runtime based on declared permissions, not hardcoded references. Available permission namespaces:

| Namespace | Examples | Grants |
|---|---|---|
| `fs` | `fs:read`, `fs:write` | Filesystem access |
| `http` | `http:get`, `http:post` | Outbound HTTP calls |
| `env` | `env:read` | Environment variable access |
| `db` | `db:read`, `db:write` | Database queries |
| `shell` | `shell:exec` | Shell command execution (requires explicit approval) |

Permissions are validated against the agent's declared capability list. If an agent tries to call a tool for which it lacks permission, the runtime raises a `PermissionError` and the execution fails safely.

---

## 4. Output Contract

Tool `execute()` must return a **JSON-serializable** object. This output is:

1. Returned to the LLM as a tool call result
2. Emitted as a `tool.called` event in `/stream`
3. Logged by the observability layer

```typescript
// Good — JSON-serializable
return { success: true, result: "File written to /tmp/output.json" };

// Bad — not serializable
return new Buffer(...);     // ❌
return someClassInstance;   // ❌
```

---

## 5. Using Tools in Agent Code

An agent declares which tools it can use:

```typescript
// src/agent.ts
import { defineAgent } from "@kiln/sdk";

export default defineAgent({
  name: "code-reviewer",
  tools: ["read-file", "search-code", "write-report"],  // Must exist in tools/

  async execute(ctx) {
    const file = await ctx.tools.call("read-file", { path: "./src/index.ts" });
    // ... agent logic
  },
});
```

---

## 6. Discovery

The Runtime Host auto-discovers tools from the `tools/` directory. Any `.ts` file that exports a `defineTool()` default export is registered automatically.

```
tools/
  read-file.ts       ← Registered as "read-file"
  write-file.ts      ← Registered as "write-file"
  search-github.ts   ← Registered as "search-github"
```

---

## 7. Common Pitfalls

| Mistake | Correct Approach |
|---|---|
| Returning `undefined` from `execute()` | Always return a JSON-serializable object |
| Missing `permissions` declaration | All permissions must be explicit — no implicit grants |
| Putting business logic in tools | Tools are infrastructure; decisions belong in agents |
| Using `fetch()` directly inside agents | Wrap it in a Connector + Tool |
| Tools that modify global state | Use `ctx.state` for inter-step communication |
