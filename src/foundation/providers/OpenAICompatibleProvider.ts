import { KilnError } from "../../utils/errors.js";
import type { ChatOptions, ChatResult, ProviderAdapter, StreamChunk, ToolCallRequest } from "../../runtime/interfaces/ProviderAdapter.js";

export interface OpenAICompatibleConfig { name: string; baseURL: string; apiKeyEnvVar?: string; }

interface RawToolCall { id: string; function: { name: string; arguments: string } }
interface RawChoice { message?: { content: string | null; tool_calls?: RawToolCall[] }; delta?: { content?: string; tool_calls?: RawToolCall[] }; finish_reason?: string | null }
interface RawChatResponse { choices: RawChoice[] }

/** Real fetch-based ProviderAdapter for any OpenAI-compatible /chat/completions endpoint (OpenAI, Groq, Ollama). */
export class OpenAICompatibleProvider implements ProviderAdapter {
  public readonly name: string;
  private readonly baseURL: string;
  private readonly apiKeyEnvVar?: string;

  public constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.baseURL = config.baseURL.replace(/\/$/, "");
    this.apiKeyEnvVar = config.apiKeyEnvVar;
  }

  public async chat(options: ChatOptions): Promise<ChatResult> {
    const raw = await this.request("/chat/completions", this.toRequestBody(options));
    return this.toChatResult(raw);
  }

  public async toolCall(options: ChatOptions): Promise<ChatResult> {
    return this.chat(options);
  }

  public async json(options: ChatOptions): Promise<unknown> {
    const raw = await this.request("/chat/completions", { ...this.toRequestBody(options), response_format: { type: "json_object" } });
    const result = this.toChatResult(raw);
    try { return JSON.parse(result.content); }
    catch (error) { throw new KilnError(`${this.name} did not return valid JSON.`, error); }
  }

  public async stream(options: ChatOptions, onChunk: (chunk: StreamChunk) => void): Promise<ChatResult> {
    const response = await this.send("/chat/completions", { ...this.toRequestBody(options), stream: true });
    if (!response.body) throw new KilnError(`${this.name} returned no response stream.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") { onChunk({ delta: "", done: true }); continue; }
        let parsed: RawChatResponse;
        try { parsed = JSON.parse(payload) as RawChatResponse; } catch { continue; }
        const delta = parsed.choices[0]?.delta?.content ?? "";
        if (delta) { content += delta; onChunk({ delta, done: false }); }
      }
    }
    return { content };
  }

  public embeddings(): Promise<never> { return this.unimplemented("embeddings"); }
  public vision(): Promise<never> { return this.unimplemented("vision"); }
  public audio(): Promise<never> { return this.unimplemented("audio"); }

  private unimplemented(capability: string): Promise<never> {
    return Promise.reject(new KilnError(`${this.name} does not implement ${capability} yet.`));
  }

  private toRequestBody(options: ChatOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((message) => ({ role: message.role, content: message.content, ...(message.name ? { name: message.name } : {}), ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}), ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}) })),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    };
    if (options.tools?.length) body.tools = options.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    return body;
  }

  private toChatResult(raw: RawChatResponse): ChatResult {
    const message = raw.choices[0]?.message;
    const toolCalls: ToolCallRequest[] | undefined = message?.tool_calls?.map((call) => ({ id: call.id, name: call.function.name, arguments: this.parseArguments(call.function.arguments) }));
    return { content: message?.content ?? "", toolCalls, raw };
  }

  private parseArguments(raw: string): unknown {
    try { return JSON.parse(raw); } catch { return raw; }
  }

  private async request(path: string, body: Record<string, unknown>): Promise<RawChatResponse> {
    const response = await this.send(path, body);
    return (await response.json()) as RawChatResponse;
  }

  private async send(path: string, body: Record<string, unknown>): Promise<Response> {
    const apiKey = this.apiKeyEnvVar ? process.env[this.apiKeyEnvVar] : undefined;
    if (this.apiKeyEnvVar && !apiKey) throw new KilnError(`${this.name} requires the ${this.apiKeyEnvVar} environment variable to be set.`);
    const response = await fetch(`${this.baseURL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new KilnError(`${this.name} request failed (${response.status}): ${await response.text()}`);
    return response;
  }
}
