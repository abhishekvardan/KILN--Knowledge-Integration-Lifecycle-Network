# KILN Runtime

The KILN runtime prepares installed packages for execution; it never invokes an AI model. `kiln run <package>` loads the installed package, validates its manifest, resolves its runtime, loads prompt and workflow files, and builds an `ExecutionPlan`.

`RuntimeProvider` defines `validate(plan)`, `prepare(plan)`, and `execute(plan)`. The bundled `PromptRuntime` validates that the entrypoint is a loaded prompt. Its `execute` method deliberately throws `Execution is not implemented yet.`

An execution plan contains package identity, runtime and entrypoint, loaded prompts/workflows, permissions, compatibility, variables, dependencies, and descriptive metadata. New providers such as OpenAI, Anthropic, Gemini, Ollama, and OpenRouter can implement the interface without changing CLI commands.
