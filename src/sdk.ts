export { defineAgent } from "./foundation/agents/defineAgent.js";
export type { AgentContext, AgentDefinition, AgentMemory, BoundAI, BoundChatOptions, ObjectOptions } from "./foundation/agents/defineAgent.js";
export { defineTool } from "./foundation/tools/defineTool.js";
export { defineConnector } from "./foundation/connectors/defineConnector.js";
export { defineProvider } from "./foundation/providers/defineProvider.js";
export { combinePrompts, definePrompt } from "./foundation/prompts/definePrompt.js";
export type { PromptOptions } from "./foundation/prompts/definePrompt.js";
export { connectMCP } from "./foundation/mcp/connectMCP.js";
export type { MCPConnection, MCPServerConfig } from "./foundation/mcp/connectMCP.js";
export type { ChatMessage, ChatOptions, ChatResult, StreamChunk, ToolCallRequest, ToolDefinitionForProvider } from "./runtime/interfaces/ProviderAdapter.js";
export type { JsonSchema, Tool, ToolExecutionContext } from "./runtime/interfaces/Tool.js";
export type { Connector } from "./runtime/interfaces/Connector.js";
export type { AgentDescriptor, AgentRunOptions, AgentRunResult } from "./runtime/AgentRuntime.js";
export type { BatchRunItem, BatchRunOptions, BatchTarget } from "./runtime/BatchRunner.js";
export type { RuntimeEvent, RuntimeEventType } from "./runtime/EventBus.js";
export type { PipelineAgentRef, PipelineOptions, PipelineResult, PipelineRunContext, PipelineStep, PipelineStepOutcome } from "./runtime/Orchestrator.js";

import { AgentRuntime, type AgentDescriptor, type AgentRunOptions, type AgentRunResult } from "./runtime/AgentRuntime.js";
import { BatchRunner, type BatchRunItem, type BatchRunOptions, type BatchTarget } from "./runtime/BatchRunner.js";
import { EventBus } from "./runtime/EventBus.js";
import type { AgentDefinition } from "./foundation/agents/defineAgent.js";
import { MemoryManager } from "./runtime/MemoryManager.js";
import { Orchestrator, type PipelineOptions, type PipelineResult, type PipelineStep } from "./runtime/Orchestrator.js";
import { ClaudeProvider, GeminiProvider, GroqProvider, OllamaProvider, OpenAIProvider, ProviderManager } from "./runtime/ProviderManager.js";
import { RuntimeRegistry } from "./runtime/RuntimeRegistry.js";

export interface Kiln {
  readonly events: EventBus;
  /** A package directory holds either one legacy src/agent.ts or many src/agents/<name>.ts — pass agentName to pick one. */
  runAgent(packageDirectory: string, input?: unknown, options?: AgentRunOptions): Promise<AgentRunResult>;
  /** Runs an in-hand defineAgent(...) definition directly — no folder, no kiln init, define and run in one file. */
  runInlineAgent(definition: AgentDefinition, input?: unknown, options?: AgentRunOptions): Promise<AgentRunResult>;
  /** Agents a package directory defines: one entry per src/agents/*.ts, or a single unnamed entry for legacy src/agent.ts. */
  listAgents(packageDirectory: string): Promise<AgentDescriptor[]>;
  runBatch(targets: BatchTarget[], input?: unknown, options?: BatchRunOptions): Promise<BatchRunItem[]>;
  /**
   * Runs a DAG of agent steps (inline definitions or file-based, mixed freely): independent steps run
   * concurrently, dependent steps wait on `dependsOn`, a failed step cascades to "skipped" for its
   * dependents instead of running them with missing input, and each step retries against a pluggable
   * validity check. This is the actual orchestration primitive — see PipelineStep/PipelineOptions.
   */
  orchestrate(steps: PipelineStep[], options?: PipelineOptions): Promise<PipelineResult>;
}

/** Creates a ready-to-use kiln runtime (all built-in providers registered) for a Node backend to import directly, no HTTP hop or CLI needed. */
export function createKiln(): Kiln {
  const registry = new RuntimeRegistry();
  const providers = new ProviderManager(registry);
  for (const provider of [new OpenAIProvider(), new GeminiProvider(), new ClaudeProvider(), new GroqProvider(), new OllamaProvider()]) providers.register(provider);
  const events = new EventBus();
  const agentRuntime = new AgentRuntime(providers, new MemoryManager(), events);
  const batchRunner = new BatchRunner(agentRuntime);
  const orchestrator = new Orchestrator(agentRuntime);
  return {
    events,
    runAgent: (packageDirectory, input = {}, options) => agentRuntime.run(packageDirectory, input, options),
    runInlineAgent: (definition, input = {}, options) => agentRuntime.runDefinition(definition, input, options),
    listAgents: (packageDirectory) => agentRuntime.listAgents(packageDirectory),
    runBatch: (targets, input = {}, options) => batchRunner.run(targets, input, options),
    orchestrate: (steps, options) => orchestrator.run(steps, options),
  };
}
