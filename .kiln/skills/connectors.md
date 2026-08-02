# Connectors

Connectors are **reusable integration adapters** for external systems. They provide the connection plumbing that Tools use to communicate with databases, APIs, and third-party services.

> [!IMPORTANT]
> Connectors contain **no agent logic**. They are pure infrastructure — typed clients, connection pools, and authentication wrappers. Decision-making belongs exclusively in agent code.

---

## 1. Tool vs. Connector — The Distinction

| | Tool | Connector |
|---|---|---|
| **Purpose** | Action an agent takes | Connection to an external system |
| **Exposes** | Input schema + execute | Client methods + config |
| **Contains** | Agent-callable logic | Auth, retry, connection management |
| **Example** | `CreateGitHubIssueTool` | `GitHubConnector` |

One Connector can back multiple Tools.

---

## 2. Anatomy of a Connector

```typescript
// connectors/github.ts
import { defineConnector } from "@kiln/sdk";
import { Octokit } from "@octokit/rest";

export default defineConnector({
  name: "github",
  description: "GitHub REST API client. Provides authenticated access to GitHub repositories, issues, and pull requests.",

  // Configuration resolved from environment — NEVER hardcoded
  config: {
    token: process.env.GITHUB_TOKEN!,
    baseUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
  },

  // Called once on startup — returns the client instance
  async connect(config) {
    return new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl,
    });
  },

  // Called on shutdown or error — clean up resources
  async disconnect(client) {
    // Octokit has no persistent connections, but a database connector would close the pool here
  },
});
```

---

## 3. Using a Connector from a Tool

```typescript
// tools/create-github-issue.ts
import { defineTool } from "@kiln/sdk";
import { z } from "zod";

export default defineTool({
  name: "create-github-issue",
  description: "Creates a new issue in a GitHub repository.",
  permissions: ["http:post"],
  connectors: ["github"],   // Declare which connectors this tool needs

  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).default([]),
  }),

  async execute(input, ctx) {
    const github = ctx.connectors.get("github");   // Typed, pre-connected client
    const issue = await github.issues.create({
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      body: input.body,
      labels: input.labels,
    });
    return { issueNumber: issue.data.number, url: issue.data.html_url };
  },
});
```

---

## 4. Connector Requirements

| Field | Type | Required | Purpose |
|---|---|---|---|
| `name` | `string` | ✅ | Unique identifier used by Tools to request the connector |
| `description` | `string` | ✅ | Human-readable description for the registry |
| `config` | `object` | ✅ | Configuration values (from `process.env.*` only) |
| `connect` | `async fn` | ✅ | Called once on startup; returns the client instance |
| `disconnect` | `async fn` | recommended | Called on shutdown; releases resources |

---

## 5. Discovery

Connectors are auto-discovered from the `connectors/` directory. Any `.ts` file with a `defineConnector()` default export is registered:

```
connectors/
  github.ts           ← Registered as "github"
  postgres.ts         ← Registered as "postgres"
  slack.ts            ← Registered as "slack"
  redis.ts            ← Registered as "redis"
```

---

## 6. Connection Lifecycle

```
Server Start
  → connect() called for all connectors
  → Clients stored in runtime registry

Request / Invoke
  → ctx.connectors.get("github") returns pre-connected client
  → Tool executes using the client

Server Shutdown
  → disconnect() called for all connectors
  → Resources (DB pools, sockets) released cleanly
```

---

## 7. Configuration Rules

- All config values come from **environment variables** only.
- Do not read from `.kiln/*.yaml` inside a connector — that is the runtime's job.
- Connection strings, tokens, and URLs are always environment variables.

```typescript
// ✅ Correct
config: {
  connectionString: process.env.DATABASE_URL!,
}

// ❌ Wrong — hardcoded
config: {
  connectionString: "postgres://localhost:5432/mydb",
}
```

---

## 8. Common Pitfalls

| Mistake | Correct Approach |
|---|---|
| Putting business logic in `connect()` | `connect()` only creates/validates the client |
| Sharing connector instances across requests via global state | Use `ctx.connectors.get()` — it is request-scoped |
| Missing `disconnect()` for DB pool connectors | Always implement `disconnect()` to avoid connection leaks |
| Using `fetch()` directly in an agent | Wrap in a Connector + Tool |
| Multiple connectors doing the same job | Consolidate into a single shared connector |
