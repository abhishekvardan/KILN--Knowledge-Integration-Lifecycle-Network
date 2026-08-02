# Workflows

Workflows are **declarative YAML orchestration graphs** that define how agents, tools, and steps are coordinated. KILN compiles them internally into **LangGraph** state machines.

> [!IMPORTANT]
> Developers **never interact with LangGraph directly**. Write workflow YAML — KILN compiles it. LangGraph is a private implementation detail.

---

## 1. Where Workflows Live

```
workflows/
  main.yaml          Entry-point workflow (executed by default)
  github-review.yaml Custom workflow
  code-audit.yaml    Another workflow
```

Each `.yaml` file in `workflows/` is discovered automatically by the Runtime Host on startup.

---

## 2. YAML Schema

```yaml
name: github-review          # Unique workflow identifier (kebab-case)
description: "Reviews a GitHub PR using multiple specialised agents"

# Optional: default input schema
input:
  repository:
    type: string
    required: true
  pullRequest:
    type: integer
    required: true

steps:
  - id: fetch_pr              # Unique step identifier
    agent: github-fetcher     # Agent name (matches defineAgent({ name }))
    input:
      repository: "{{input.repository}}"
      pullRequest: "{{input.pullRequest}}"

  - id: review_code
    agent: code-reviewer
    depends_on: [fetch_pr]   # Runs after fetch_pr completes
    input:
      diff: "{{fetch_pr.output.diff}}"

  - id: security_check
    agent: security-scanner
    depends_on: [fetch_pr]   # Runs in parallel with review_code
    input:
      diff: "{{fetch_pr.output.diff}}"

  - id: final_report
    agent: report-generator
    depends_on: [review_code, security_check]   # Waits for both
    input:
      review: "{{review_code.output}}"
      security: "{{security_check.output}}"
```

---

## 3. LangGraph Compilation

When the Runtime Host starts (or when `kiln run` is called), KILN:

1. Parses all `workflows/*.yaml` files
2. Resolves `depends_on` into a directed acyclic graph (DAG)
3. Compiles the DAG into a **LangGraph StateGraph** internally
4. Registers the compiled graph in the runtime registry

Steps with no mutual `depends_on` relationship are executed **in parallel** automatically by LangGraph.

> [!NOTE]
> The LangGraph compilation step validates that:
> - All referenced agent names exist in the registry
> - There are no circular dependencies
> - All `{{input.*}}` and `{{stepId.output.*}}` references are resolvable

---

## 4. Step Input/Output Interpolation

Use `{{expression}}` syntax to wire outputs from one step into the input of another:

| Expression | Resolves To |
|---|---|
| `{{input.repository}}` | Top-level workflow input field `repository` |
| `{{fetch_pr.output.diff}}` | The `diff` field from step `fetch_pr`'s output |
| `{{fetch_pr.output}}` | The entire output object from step `fetch_pr` |

All step outputs must be **JSON-serializable** objects.

---

## 5. Parallel Execution

Steps that are independent (not in each other's `depends_on`) run concurrently:

```yaml
steps:
  - id: lint_check
    agent: linter
    # No depends_on — starts immediately

  - id: type_check
    agent: type-checker
    # No depends_on — starts immediately, in parallel with lint_check

  - id: final
    agent: aggregator
    depends_on: [lint_check, type_check]   # Waits for both
```

---

## 6. Invoking a Workflow via HTTP

```http
POST /invoke
Content-Type: application/json

{
  "workflow": "github-review",
  "input": {
    "repository": "https://github.com/acme/api",
    "pullRequest": 42
  }
}
```

Response:
```json
{
  "executionId": "exec_01j2xyz...",
  "status": "running"
}
```

For streaming (SSE):
```http
POST /stream
Content-Type: application/json
Accept: text/event-stream
```

---

## 7. Using `defineWorkflow()` in Code

For programmatic workflows (instead of YAML):

```typescript
// workflows/code-review.ts
import { defineWorkflow } from "@kiln/sdk";

export default defineWorkflow({
  name: "code-review",
  steps: [
    { id: "fetch", agent: "github-fetcher" },
    { id: "review", agent: "code-reviewer", dependsOn: ["fetch"] },
  ],
});
```

TypeScript-based workflows are compiled the same way as YAML workflows.

---

## 8. Common Pitfalls

| Mistake | Correct Approach |
|---|---|
| Importing `@langchain/langgraph` in code | Remove it; describe the graph in YAML or `defineWorkflow()` |
| Using sequential `await` chains for agents | Declare parallelism with `depends_on` in YAML |
| Non-JSON step outputs | Ensure all agents return JSON-serializable objects |
| Circular `depends_on` | `kiln validate` will catch and reject this |
| Unnamed workflow steps | All step `id` values must be unique within the workflow |
