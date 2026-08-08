import type { ZodTypeAny } from "zod";

export interface ToolExecutionContext { runId: string; log(event: string, data?: unknown): void; }

/** A raw JSON Schema object, for tools whose parameters aren't a zod schema — e.g. MCP-sourced tools, which declare inputSchema as JSON Schema and validate server-side. */
export type JsonSchema = Record<string, unknown>;

export interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly permissions: string[];
  /** A zod schema (validated locally before execute()) or a raw JSON Schema (passed through as-is, e.g. from MCP). */
  readonly parameters?: ZodTypeAny | JsonSchema;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput>;
}
