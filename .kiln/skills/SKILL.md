# agenthub-cli — KILN Agent Project Instructions

This is the **KILN CLI** source project — the tool that scaffolds, validates, packages, and runs KILN AI Agent projects.

> [!IMPORTANT]
> This repository is the **framework itself**, not a user-created agent project. When making changes here you are modifying the CLI that developers use to build KILN projects.

> [!WARNING]
> Do NOT generate agent business logic from natural language. Do NOT replace developer-owned code. Make focused, localized changes that respect the architecture described in the linked documents below.

## How to use this documentation

This `.kiln/skills/` directory is the authoritative modular specification for working within this project. **Read the relevant document before making changes.** Do not rely solely on this file.

| Document | Domain |
|---|---|
| [architecture.md](./architecture.md) | Project structure, CLI internals, command lifecycle |
| [runtime.md](./runtime.md) | Runtime Host, `kiln dev`, execution lifecycle, HTTP server |
| [providers.md](./providers.md) | AI provider abstraction, LangChain integration, model config |
| [prompts.md](./prompts.md) | `FilePromptPipeline`, layered composition, variable substitution |
| [workflows.md](./workflows.md) | Workflow YAML schema, LangGraph compilation, step graph execution |
| [tools.md](./tools.md) | Tool definition, permission model, schema, execute contract |
| [connectors.md](./connectors.md) | Connector pattern, external integrations, configuration |
| [best-practices.md](./best-practices.md) | Engineering rules, safety, testability, explicit declarations |

## Key Directories

```
src/
  commands/       CLI commands (init, validate, run, dev, pack, install)
  services/       Core services (PackageService, RuntimeService, RegistryService)
  runtime/        Runtime Host implementation (Fastify server, registry, executor)
  foundation/     Base classes, SDK definitions (defineAgent, defineTool, etc.)
  utils/          Shared utilities (errors, fs helpers)
.kiln/
  skills/         THIS directory — AI assistant specification documents
  *.yaml          CLI project runtime configuration
```

## General Directives

- **Zero Magic**: All capabilities must be declared explicitly (tools, permissions, providers).
- **Public SDK Only**: Expose only `defineAgent()`, `defineWorkflow()`, `defineTool()`, `defineConnector()`, `defineProvider()` to users. Never expose LangGraph or LangChain objects directly.
- **Testing**: Update or add tests in `tests/` whenever behavior changes.
- **Validation**: Run `kiln validate` and `npm run build` after any structural change.
- **Packaging**: Run `kiln pack` before publishing a release.
