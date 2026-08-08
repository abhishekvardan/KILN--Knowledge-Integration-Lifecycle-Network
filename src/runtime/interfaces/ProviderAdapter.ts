export interface ToolCallRequest { id: string; name: string; arguments: unknown; }
export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string; toolCallId?: string; toolCalls?: ToolCallRequest[]; }
export interface ToolDefinitionForProvider { name: string; description: string; parameters: unknown; }
export interface ChatResult { content: string; toolCalls?: ToolCallRequest[]; raw?: unknown; }
export interface ChatOptions { model: string; messages: ChatMessage[]; tools?: ToolDefinitionForProvider[]; temperature?: number; maxTokens?: number; }
export interface StreamChunk { delta: string; done: boolean; }

export interface ProviderAdapter {
  readonly name: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  stream(options: ChatOptions, onChunk: (chunk: StreamChunk) => void): Promise<ChatResult>;
  toolCall(options: ChatOptions): Promise<ChatResult>;
  json(options: ChatOptions): Promise<unknown>;
  embeddings(input: string | string[]): Promise<number[][]>;
  vision(options: ChatOptions): Promise<ChatResult>;
  audio(input: unknown): Promise<unknown>;
}
