import { KilnError } from "../utils/errors.js";
import { OpenAICompatibleProvider } from "../foundation/providers/OpenAICompatibleProvider.js";
import type { ProviderAdapter } from "./interfaces/ProviderAdapter.js";
import { RuntimeRegistry } from "./RuntimeRegistry.js";

class StubProvider implements ProviderAdapter {
  public constructor(public readonly name: string) {}
  private unavailable(): Promise<never> { return Promise.reject(new KilnError(`${this.name} is not implemented yet.`)); }
  chat() { return this.unavailable(); }
  stream() { return this.unavailable(); }
  embeddings() { return this.unavailable(); }
  toolCall() { return this.unavailable(); }
  vision() { return this.unavailable(); }
  audio() { return this.unavailable(); }
  json() { return this.unavailable(); }
}

/**
 * Ollama's own convention for OLLAMA_HOST is bare `host:port` (its docs/CLI never expect a scheme or a
 * `/v1` suffix), but kiln talks to Ollama's OpenAI-compatible endpoint, which lives under `/v1`. Reading
 * OLLAMA_HOST verbatim as the provider baseURL — as this used to — silently 404s for anyone who sets it
 * the way Ollama itself documents. Normalize instead of requiring users to know kiln's internal shape.
 */
function resolveOllamaBaseURL(): string {
  const raw = process.env.OLLAMA_HOST;
  if (!raw) return "http://localhost:11434/v1";
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const trimmed = withScheme.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export class OpenAIProvider extends OpenAICompatibleProvider { constructor() { super({ name: "openai", baseURL: "https://api.openai.com/v1", apiKeyEnvVar: "OPENAI_API_KEY" }); } }
export class GroqProvider extends OpenAICompatibleProvider { constructor() { super({ name: "groq", baseURL: "https://api.groq.com/openai/v1", apiKeyEnvVar: "GROQ_API_KEY" }); } }
export class OllamaProvider extends OpenAICompatibleProvider { constructor() { super({ name: "ollama", baseURL: resolveOllamaBaseURL() }); } }
export class GeminiProvider extends StubProvider { constructor() { super("gemini"); } }
export class ClaudeProvider extends StubProvider { constructor() { super("claude"); } }

export class ProviderManager {
  public constructor(private readonly registry: RuntimeRegistry) {}
  register(provider: ProviderAdapter) { this.registry.registerProvider(provider); }
  resolve(name: string) { return this.registry.provider(name); }
}
