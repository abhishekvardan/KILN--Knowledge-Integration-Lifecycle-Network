import type { ZodTypeAny } from "zod";
import type { Tool, ToolExecutionContext } from "../../runtime/interfaces/Tool.js";

export interface DefineToolOptions<TInput, TOutput> {
  name: string;
  description: string;
  permissions?: string[];
  parameters?: ZodTypeAny;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput>;
}

export function defineTool<TInput = unknown, TOutput = unknown>(options: DefineToolOptions<TInput, TOutput>): Tool<TInput, TOutput> {
  return { name: options.name, description: options.description, permissions: options.permissions ?? [], parameters: options.parameters, execute: options.execute };
}
