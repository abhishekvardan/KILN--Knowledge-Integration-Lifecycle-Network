import type { ZodType } from "zod";
import type { ChatMessage, ChatOptions, ChatResult, StreamChunk } from "../../runtime/interfaces/ProviderAdapter.js";
import type { Connector } from "../../runtime/interfaces/Connector.js";
import type { Tool } from "../../runtime/interfaces/Tool.js";

export type BoundChatOptions = Omit<ChatOptions, "model"> & { model?: string };

export interface ObjectOptions<T> {
  messages: ChatMessage[];
  schema: ZodType<T>;
  /** Attempts before giving up, each one feeding the previous validation error back to the model. Default 3. */
  maxAttempts?: number;
}

/** The AI client handed to an agent's execute(ctx) — bound to the agent's configured provider/model/tools. */
export interface BoundAI {
  chat(options: BoundChatOptions): Promise<ChatResult>;
  stream(options: BoundChatOptions, onChunk: (chunk: StreamChunk) => void): Promise<ChatResult>;
  json(options: BoundChatOptions): Promise<unknown>;
  /** Sends messages and automatically executes any requested tool calls, looping until a final answer or maxSteps is hit. */
  run(options: { messages: ChatMessage[]; maxSteps?: number }): Promise<ChatResult>;
  /**
   * Structured output with a zod schema: writes the schema instruction into the prompt for you, validates
   * the model's response against it, and — on failure — feeds the validation error back and retries, up
   * to `maxAttempts`. Returns fully typed, validated data; throws (not `{ raw }`) if it never validates.
   * Replaces the hand-written "respond with ONLY JSON of this shape" + JSON.parse + raw-fallback pattern.
   */
  object<T>(options: ObjectOptions<T>): Promise<T>;
}

export interface AgentMemory {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface AgentContext<TInput = unknown> {
  readonly input: TInput;
  readonly runId: string;
  readonly ai: BoundAI;
  readonly tools: Record<string, (input: unknown) => Promise<unknown>>;
  readonly memory: AgentMemory;
  log(event: string, data?: unknown): void;
}

export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly tools?: Tool[];
  readonly connectors?: Connector[];
  execute(ctx: AgentContext<TInput>): Promise<TOutput>;
}

export interface DefineAgentOptions<TInput, TOutput> {
  name: string;
  description?: string;
  provider?: string;
  model?: string;
  tools?: Tool[];
  connectors?: Connector[];
  execute(ctx: AgentContext<TInput>): Promise<TOutput>;
}

export function defineAgent<TInput = unknown, TOutput = unknown>(options: DefineAgentOptions<TInput, TOutput>): AgentDefinition<TInput, TOutput> {
  return { name: options.name, description: options.description, provider: options.provider, model: options.model, tools: options.tools, connectors: options.connectors, execute: options.execute };
}
