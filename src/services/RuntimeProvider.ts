import type { ExecutionPlan } from "../types.js";

export interface RuntimeProvider { readonly name: string; validate(plan: ExecutionPlan): Promise<void>; prepare(plan: ExecutionPlan): Promise<ExecutionPlan>; execute(plan: ExecutionPlan): Promise<never>; }

export class PromptRuntime implements RuntimeProvider {
  public readonly name = "prompt";
  public async validate(plan: ExecutionPlan): Promise<void> { if (!plan.prompts[plan.entrypoint]) throw new Error(`Entrypoint prompt not found: ${plan.entrypoint}`); }
  public async prepare(plan: ExecutionPlan): Promise<ExecutionPlan> { await this.validate(plan); return plan; }
  public async execute(_plan: ExecutionPlan): Promise<never> { throw new Error("Execution is not implemented yet."); }
}
