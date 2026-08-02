# AI Providers

KILN abstracts all AI provider integration. Agents are model-agnostic by design — they never call a provider SDK directly.

> [!IMPORTANT]
> Provider configuration lives **exclusively** in `.kiln/providers.yaml`. Never hardcode model names, API keys, or provider SDKs into `src/agent.ts` or any agent code.

---

## 1. Internal Implementation: LangChain

Internally, KILN uses **LangChain** as the provider abstraction layer. LangChain handles:

- Prompt formatting and submission
- Tool/function calling protocol
- Streaming responses
- Memory integration
- Provider-specific retry and rate-limit handling

> [!WARNING]
> LangChain is an **internal detail**. Never import `langchain` or `@langchain/*` directly in agent code or tool implementations. Use KILN's public SDK instead.

---

## 2. `.kiln/providers.yaml` — Configuration Reference

```yaml
# The default provider used when no override is specified.
default: openai

providers:
  openai:
    model: gpt-4o               # Model name as accepted by the provider
    temperature: 0.2            # Optional: 0.0–2.0
    maxTokens: 4096             # Optional: max completion tokens
    timeout: 30000              # Optional: ms
    retries: 3                  # Optional: retry count on transient errors

  gemini:
    model: gemini-1.5-pro
    temperature: 0.1

  claude:
    model: claude-3-5-sonnet-20241022
    maxTokens: 8192
```

---

## 3. Credential Resolution

KILN resolves credentials from the environment automatically:

| Provider | Environment Variable |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` |

> [!CAUTION]
> Never store credentials in `providers.yaml` or any file committed to source control.

---

## 4. Switching Providers

To switch the active AI model:

1. Edit `.kiln/providers.yaml`
2. Change the `default:` key, or update a specific provider's `model:`
3. Run `kiln validate` to verify the configuration
4. Restart `kiln dev`

No code changes are required.

---

## 5. Per-Workflow Provider Override

A workflow step can override the provider:

```yaml
# workflows/main.yaml
name: main
steps:
  - id: fast_summary
    agent: summariser
    provider: gemini      # Override default for this step only
    model: gemini-1.5-flash
```

---

## 6. Using `defineProvider()` (Advanced)

For custom provider implementations (e.g., a private model endpoint):

```typescript
// connectors/my-llm.ts
import { defineProvider } from "@kiln/sdk";

export default defineProvider({
  name: "my-private-llm",
  description: "Internal fine-tuned model",
  async invoke(prompt, options) {
    // Custom HTTP call to private endpoint
    const response = await fetch(process.env.MY_LLM_ENDPOINT!, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    return response.json();
  },
});
```

Then reference it in `.kiln/providers.yaml`:

```yaml
default: my-private-llm
providers:
  my-private-llm:
    model: internal-v2
```

---

## 7. Common Pitfalls

| Mistake | Correct Approach |
|---|---|
| `import OpenAI from "openai"` in agent code | Remove it; let KILN handle provider calls |
| Hardcoding `"gpt-4o"` as a string in logic | Put model names in `providers.yaml` only |
| Storing keys in `.env.committed` | Use `.env` (git-ignored) or a secrets manager |
| Different models per-environment in code | Use environment-specific `providers.yaml` files |
