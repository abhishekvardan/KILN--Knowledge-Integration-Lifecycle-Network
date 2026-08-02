import type { ExecutionPlan as PackageExecutionPlan } from "../types.js";
export interface RuntimeExecutionPlan extends PackageExecutionPlan { workflowId?: string; agentId?: string; provider?: string; tools: string[]; graph: ExecutionGraphNode[]; }
export interface ExecutionGraphNode { id: string; label: string; status: "pending" | "resolved" | "stubbed" | "completed"; dependsOn?: string[]; }
