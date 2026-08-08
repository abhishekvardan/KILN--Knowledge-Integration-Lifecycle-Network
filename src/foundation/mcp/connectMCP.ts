import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { KilnError } from "../../utils/errors.js";
import type { Tool, ToolExecutionContext } from "../../runtime/interfaces/Tool.js";

export interface MCPServerConfig {
  /** The executable to launch the MCP server, e.g. "npx". */
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConnection {
  /** Real kiln Tool objects, one per tool the server exposes — pass these straight into defineAgent({ tools: [...] }); they compose with ctx.ai.run()'s tool-calling loop exactly like hand-written tools. */
  tools: Tool[];
  /** Terminates the server subprocess and closes the connection. Always call this when done — an unclosed MCP server keeps its child process running. */
  close(): Promise<void>;
}

interface MCPContentItem { type: string; text?: string }
interface MCPCallToolResult { content?: MCPContentItem[]; structuredContent?: Record<string, unknown>; isError?: boolean }

function extractText(result: MCPCallToolResult): string {
  return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}

/**
 * Connects to an MCP server over stdio (spawns `command`) and exposes every tool it declares as a real
 * kiln Tool — the standard way to give an agent capabilities (filesystem access, a database, a SaaS API,
 * ...) that already have an MCP server, without hand-writing a defineTool() wrapper for each one.
 *
 * MCP tools declare their parameters as JSON Schema, not zod, so these tools skip kiln's local zod
 * validation (Tool.parameters accepts a raw JSON Schema for exactly this case) — the MCP server validates
 * the call on its own side when callTool() runs.
 */
export async function connectMCP(config: MCPServerConfig): Promise<MCPConnection> {
  const transport = new StdioClientTransport({ command: config.command, args: config.args, env: config.env });
  const client = new Client({ name: "kiln", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (error) {
    throw new KilnError(`Failed to connect to MCP server "${config.command} ${(config.args ?? []).join(" ")}".`, error);
  }

  const { tools: mcpTools } = await client.listTools();
  const tools: Tool[] = mcpTools.map((mcpTool) => ({
    name: mcpTool.name,
    description: mcpTool.description ?? "",
    permissions: [],
    parameters: mcpTool.inputSchema as Record<string, unknown>,
    async execute(input: unknown, _ctx: ToolExecutionContext): Promise<unknown> {
      const result = (await client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> })) as MCPCallToolResult;
      if (result.isError) throw new KilnError(extractText(result) || `MCP tool "${mcpTool.name}" returned an error.`);
      return result.structuredContent ?? extractText(result);
    },
  }));

  return {
    tools,
    async close() {
      await client.close();
      // client.close() resolves once the JS-side streams are closed, slightly before the underlying
      // child process handle finishes tearing down at the OS level. Calling process.exit() immediately
      // after — a completely natural thing to write — can race that teardown and crash the whole process
      // with a native libuv assertion (Windows: "UV_HANDLE_CLOSING", src/win/async.c), not a catchable JS
      // error. A short grace period here is cheap (this isn't a hot path) and avoids handing that footgun
      // to every caller.
      await new Promise((resolve) => setTimeout(resolve, 150));
    },
  };
}
