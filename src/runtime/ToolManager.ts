import { ZodType } from "zod";
import { KilnError, toErrorMessage } from "../utils/errors.js";
import type { Tool, ToolExecutionContext } from "./interfaces/Tool.js";
import { RuntimeRegistry } from "./RuntimeRegistry.js";

function isZodSchema(value: unknown): value is ZodType {
  return value instanceof ZodType;
}

export class ToolManager {
  public constructor(private readonly registry: RuntimeRegistry) {}
  register(tool: Tool) { this.registry.registerTool(tool); }
  discover() { return this.registry.toolsList(); }
  resolveDependencies(permissions: string[]) { return this.discover().filter((tool) => tool.permissions.every((permission) => permissions.includes(permission))); }

  public async invoke(name: string, input: unknown, ctx: ToolExecutionContext): Promise<unknown> {
    const tool = this.registry.tool(name);
    if (!tool) throw new KilnError(`Tool "${name}" is not registered.`);
    // A raw JSON Schema (e.g. an MCP-sourced tool) isn't locally validatable — it's passed through as-is
    // and validated wherever it's actually enforced (the MCP server, for MCP tools).
    const parsed = isZodSchema(tool.parameters) ? tool.parameters.parse(input) : input;
    ctx.log("ToolCalled", { tool: name, input: parsed });
    try {
      return await tool.execute(parsed, ctx);
    } catch (error) {
      ctx.log("ToolFailed", { tool: name, error: toErrorMessage(error) });
      throw error;
    }
  }
}
