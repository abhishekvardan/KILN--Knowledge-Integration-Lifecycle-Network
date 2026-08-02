export function getSkillTemplates(name: string): Record<string, string> {
  return {
    "SKILL.md": `# ${name} — KILN Agent Project Instructions

This project is built on the **KILN AI Agent Engineering Framework**. 
KILN strictly separates **developer-owned business logic** from **reusable agent infrastructure**.

> [!WARNING]
> Do NOT attempt to generate the core agent from natural language or replace the developer's business logic. Make focused, localized changes according to this architecture.

## How to use this documentation
This directory (\`.kiln/skills/\` or \`.kiln/\`) contains the authoritative modular specification for how to work within this KILN project. **Do not rely solely on this SKILL.md file.**

Please consult the following documents for their respective domains:
- **[architecture.md](./architecture.md)**: Project structure, where to put code vs configuration, and the strict execution lifecycle.
- **[runtime.md](./runtime.md)**: State management, context (\`ctx\`), events, and checkpoints.
- **[providers.md](./providers.md)**: How to configure and manage AI providers and models.
- **[prompts.md](./prompts.md)**: How the \`FilePromptPipeline\` layers prompts and substitutes variables.
- **[workflows.md](./workflows.md)**: How to define and execute YAML-based orchestration graphs.
- **[tools.md](./tools.md)**: Creating and binding tools for the agent.
- **[connectors.md](./connectors.md)**: Reusable integrations.
- **[best-practices.md](./best-practices.md)**: Rules of engagement, testing, and safety constraints.

## General Directives
- **Zero Magic**: Declare everything (permissions, inputs, outputs, models) explicitly.
- **Executable Entrypoint**: The agent's entrypoint is \`export async function execute(input)\` inside \`src/agent.ts\`. Keep its output JSON-serializable.
- **Testing**: Whenever modifying behavior, you MUST update or add tests in \`tests/\`.
- **Validation**: Run \`kiln validate\` after changes to ensure manifest and structure integrity.
`,
    "architecture.md": `# KILN Architecture

KILN is designed as a foundational framework for AI Agents. It enforces a strict separation of concerns between what the **developer writes** and what the **framework provides**.

## Separation of Concerns

### Developer Ownership (The \`src/\` directory)
- **Business Logic**: The core agent logic lives in \`src/agent.ts\`. This code is fully owned by the developer. It is standard TypeScript/JavaScript.
- **Domain Types**: Types specific to the agent's input/output are stored in \`src/types.ts\`.
- **Tests**: Validating agent behavior happens in \`tests/\`.

### Framework Infrastructure (The \`.kiln/\` directory)
- **Configuration**: All runtime settings (providers, memory, observability) reside in \`.kiln/*.yaml\`. 
- **Manifest**: \`agent.yaml\` acts as a purely metadata-driven manifest (name, version, description). **Do not put runtime configuration inside \`agent.yaml\`.**

## Project Structure Map

- \`src/agent.ts\`: The executable entrypoint.
- \`prompts/\`: The multi-layer prompt pipeline (system, developer, task, etc.).
- \`workflows/\`: Multi-step orchestration YAML files.
- \`tools/\` & \`connectors/\`: Reusable logic and integrations.
- \`knowledge/\`: Domain context and product specifications.
- \`.kiln/\`: Runtime infrastructure configurations.

## The Execution Lifecycle

KILN separates **Planning** from **Execution**:
1. **Plan Preparation**: The runtime prepares an execution plan based on inputs and configured tools/workflows (e.g., using \`kiln run ${name}\`). No AI is invoked at this stage.
2. **AI Execution**: Once planned, the AI provider executes the graph. This ensures deterministic setups and strict validation before costly AI API calls are made.
`,
    "runtime.md": `# KILN Runtime

The KILN runtime handles the heavy lifting of agent execution state, memory, and observability.

## Execution Context (\`ctx\`)
Every agent execution receives a Context (\`ctx\`) object. This is the central hub for accessing the runtime environment.
- It contains access to bound **Tools** and **Connectors**.
- It provides access to the **State**, allowing the agent to read and write variables during its lifecycle.
- **Rule**: Do not use global variables for state. Always use the provided \`ctx\` for state management.

## State Management Features

- **Events (\`.kiln/events.yaml\`)**: Configure event emission for logging, monitoring, and triggering downstream systems.
- **Checkpoints (\`.kiln/checkpoints.yaml\`)**: Enable checkpoints to allow the agent to pause, resume, or rollback its state. Crucial for long-running or human-in-the-loop tasks.
- **Memory (\`.kiln/memory.yaml\`)**: Configure short-term and long-term memory for the agent. The runtime handles context-window management and summarization automatically if configured.
- **Observability (\`.kiln/observability.yaml\`)**: Enable tracing and telemetry to monitor AI execution paths and latency.

> [!TIP]
> Keep the runtime settings independent of the core logic. You should be able to swap memory or checkpoint backends in the \`.kiln/\` YAMLs without modifying \`src/agent.ts\`.
`,
    "providers.md": `# AI Providers

KILN abstracts AI provider integration, allowing agents to be model-agnostic. 

## Configuration (\`.kiln/providers.yaml\`)
Provider selection and configuration must NEVER be hardcoded into the business logic (\`src/agent.ts\`). It is strictly managed in \`.kiln/providers.yaml\`.

### Structure
\`\`\`yaml
default: openai
providers:
  openai:
    model: gpt-4o
  gemini:
    model: gemini-1.5-pro
\`\`\`

## Conventions and Rules

- **No Hardcoded Credentials**: Never commit API keys or credentials. KILN automatically resolves them from the environment (e.g., \`OPENAI_API_KEY\`, \`GEMINI_API_KEY\`).
- **Provider Switching**: To change the AI model, only modify \`providers.yaml\`. Do not add provider-specific SDKs to the project unless building a custom, non-standard Connector.
- **Network Calls**: Do not write custom fetch/axios calls to AI APIs. Always rely on KILN's execution engine.
`,
    "prompts.md": `# Prompting Pipeline

KILN uses a composed \`FilePromptPipeline\` rather than a single massive prompt string. 

## The Composition Layers
Prompt layers in the \`prompts/\` directory are merged in a specific order to build the final context sent to the AI:

1. **\`system.md\`**: The permanent, core identity and behavior of the agent.
2. **\`developer.md\`**: Engineering constraints, formatting rules, and strict instructions (e.g., "Always output JSON").
3. **\`task.md\`**: The specific instructions for the current invocation.
4. **\`examples.md\`**: Few-shot examples of expected inputs and outputs.
5. **\`safety.md\`**: Privacy boundaries and escalation triggers.

## Variable Substitution
You can define variables in \`prompts/variables.yaml\`.
- **Usage**: In any markdown prompt layer, use \`{{variableName}}\`.
- KILN's pipeline will automatically substitute these variables at runtime before sending the prompt to the provider.

## Best Practices
- Keep instructions modular. Don't put task details in \`system.md\`.
- Treat \`developer.md\` as the place for "rules that cannot be broken".
`,
    "workflows.md": `# Workflows

Workflows allow you to define multi-step, complex orchestration graphs using simple YAML files in the \`workflows/\` directory.

## Graph Definition
Instead of writing complex while-loops and conditionals in code for agent orchestration, KILN uses YAML graphs to define the steps and transitions.

### Example (\`workflows/main.yaml\`)
\`\`\`yaml
name: main
steps:
  - id: step_one
    agent: my_agent
    input: ...
  - id: step_two
    agent: another_agent
    depends_on: [step_one]
\`\`\`

## Responsibilities
- **YAML over Code**: Use workflows for coordinating multiple agents or discrete complex steps. 
- **Parallelism**: Workflows natively handle running independent steps in parallel. Use this instead of manual \`Promise.all()\` inside the agent logic where applicable.
- **State Passing**: The output of one step can be seamlessly mapped as the input to the next within the YAML definition.
`,
    "best-practices.md": `# Best Practices & Constraints

When developing or modifying a KILN agent project, adhere strictly to these engineering constraints:

## 1. Testability
- Keep your business logic in \`src/agent.ts\` pure and testable.
- Avoid side-effects inside the core logic if they can be handled by a Tool or Connector.
- Write tests in \`tests/\` for every new behavior or workflow step.

## 2. Explicit Declarations
- **Zero Magic**: If an agent needs a capability (read a file, call an API), it must be explicitly granted via a Tool.
- Do not make implicit assumptions about the runtime environment.

## 3. Data Contracts
- Ensure that the output of your agent is **JSON-serializable**. 
- Define rigorous TypeScript interfaces in \`src/types.ts\` for both \`AgentInput\` and \`AgentOutput\`.

## 4. Safety and Network
- **Do not add arbitrary network integrations** (e.g., raw \`fetch\` calls) into the agent logic. Use Connectors.
- **Do not hardcode secrets**. Use environment variables and proper KILN configuration layers.
`,
    "tools.md": `# Tools

Tools provide the agent with concrete actions it can take in the external world or within the system.

## Definition & Structure
Tools must declare:
1. **Metadata**: Name, description, and usage instructions for the LLM.
2. **Permissions**: Explicit declaration of what the tool is allowed to do.
3. **Schema**: Zod or JSON Schema for input validation.
4. **Execute Contract**: The actual implementation function.

## Runtime Resolution
- **Permission-Based**: Tools are bound to the agent based on declared permissions rather than hardcoded references. 
- **Reusability**: Build tools generically in the \`tools/\` directory so they can be reused across different workflows and agents.
- **Safety**: The execution context (\`ctx\`) enforces that an agent can only invoke a tool it has been explicitly granted access to.
`,
    "connectors.md": `# Connectors

Connectors represent reusable integrations with external systems, databases, or third-party APIs.

## Purpose
While Tools represent *actions* the agent can take, Connectors represent the *plumbing* to a specific external service (e.g., Slack, Postgres, GitHub).

## Rules for Connectors
- **No Agent Logic**: Connectors should be "dumb" API wrappers or standard database clients. They should not contain agent decision-making logic.
- **Configuration**: Connection strings, URLs, and API keys for Connectors should be resolved from the environment, NEVER hardcoded.
- **Directory**: Place custom connectors in the \`connectors/\` directory.
- **Reusability**: Write Connectors so that multiple different Tools can utilize the same Connector instance (e.g., a \`GitHubConnector\` used by both \`CreateIssueTool\` and \`ReadPRTool\`).
`
  };
}
