export type WorkflowNode = { id: string; type: "sequential" | "parallel" | "conditional" | "retry" | "agent"; dependsOn?: string[]; retries?: number; condition?: string; };
export interface Workflow { id: string; nodes: WorkflowNode[]; }
import { RuntimeRegistry } from "./RuntimeRegistry.js";
export class WorkflowManager { public constructor(private readonly registry: RuntimeRegistry) {} register(workflow: Workflow) { this.registry.registerWorkflow(workflow); } resolve(id?: string) { return id ? this.registry.workflow(id) : undefined; } }
