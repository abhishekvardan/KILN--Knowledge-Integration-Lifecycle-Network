# hello-news

Describe what this AI agent does.

## KILN

KILN is an AI Agent Engineering Framework. You own the agent logic; KILN supplies the project structure and reusable runtime foundations.

## Where to work

- Business logic: `src/agent.ts`
- Prompts: `prompts/`
- Workflows: `workflows/`
- Tools and connectors: `tools/`, `connectors/`
- Project knowledge: `knowledge/`
- Runtime configuration: `.kiln/*.yaml`

## Commands

`kiln validate` validates the project.
`kiln run hello-news` prepares its execution plan (no AI is invoked).
`kiln pack` creates a distributable package.
`kiln install ./<package>.agent` installs a package locally.
