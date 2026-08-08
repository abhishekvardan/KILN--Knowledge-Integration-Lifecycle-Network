import { KilnError } from "../utils/errors.js";
import type { AgentDefinition } from "../foundation/agents/defineAgent.js";
import { AgentRuntime, type AgentRunResult } from "./AgentRuntime.js";
import { ConcurrencyPool } from "./ConcurrencyPool.js";

/** An agent to run: either an in-hand definition (defineAgent(...) called inline, no folder) or a file-based package. */
export type PipelineAgentRef = AgentDefinition | { directory: string; agentName?: string };

export interface PipelineRunContext {
  /** Each completed step's output, keyed by step id. Only deps declared in `dependsOn` are safe to read. */
  outputs: Record<string, unknown>;
  results: Record<string, AgentRunResult>;
}

export interface PipelineStep<TOutput = unknown> {
  id: string;
  agent: PipelineAgentRef;
  /**
   * Static input, or a function of prior steps' outputs — called once per attempt. `unknown` in the
   * union swallows contextual typing for the function branch, so annotate the callback's parameter
   * explicitly: `input: (ctx: PipelineRunContext) => ({...})`, not `input: (ctx) => ({...})`.
   */
  input: unknown | ((context: PipelineRunContext) => unknown | Promise<unknown>);
  /** Which step ids must succeed before this one runs. Omit for a root step (no dependencies). */
  dependsOn?: string[];
  /** Overrides PipelineOptions.retries for this step only. */
  retries?: number;
  /** Overrides the default validity check (rejects `{ raw: "..." }` — the parse-failure fallback convention used throughout kiln agents) for this step only. */
  isValid?: (output: TOutput) => boolean;
}

export interface PipelineOptions {
  /** Max steps running at once — independent branches of the DAG run concurrently up to this cap. */
  concurrency?: number;
  /** Default extra attempts (beyond the first) for any step that doesn't set its own `retries`. */
  retries?: number;
  onStep?: (id: string, result: AgentRunResult, attempt: number) => void;
}

export interface PipelineStepOutcome {
  id: string;
  status: "succeeded" | "failed" | "skipped";
  result?: AgentRunResult;
  attempts: number;
  skippedReason?: string;
}

export interface PipelineResult {
  outputs: Record<string, unknown>;
  results: Record<string, AgentRunResult>;
  steps: PipelineStepOutcome[];
  durationMs: number;
}

function isInlineDefinition(agent: PipelineAgentRef): agent is AgentDefinition {
  return typeof (agent as AgentDefinition).execute === "function";
}

/** `{ raw: "..." }` is the parse-failure fallback convention used throughout kiln's own example agents — treat it as invalid by default so a malformed model response triggers a retry instead of silently flowing downstream. */
function defaultIsValid(output: unknown): boolean {
  if (output && typeof output === "object" && "raw" in output) return !(output as { raw?: unknown }).raw;
  return true;
}

function detectCycle(steps: PipelineStep[]): void {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") throw new KilnError(`Pipeline has a dependency cycle: ${[...path, id].join(" -> ")}`);
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep, [...path, id]);
    state.set(id, "done");
  };
  for (const step of steps) visit(step.id, []);
}

/**
 * Runs a DAG of agent steps: independent branches execute concurrently (capped by ConcurrencyPool),
 * dependent steps wait for their declared `dependsOn` to succeed, a step with a failed dependency is
 * marked "skipped" rather than run with missing input (and its own dependents cascade-skip too), and
 * each step gets its own retry budget against a pluggable validity check. This is the actual hard part
 * of "orchestration" — a hand-written sequential await chain gives you none of the above for free.
 */
export class Orchestrator {
  public constructor(private readonly agentRuntime: AgentRuntime) {}

  public async run(steps: PipelineStep[], options: PipelineOptions = {}): Promise<PipelineResult> {
    const startedAt = Date.now();
    if (!steps.length) return { outputs: {}, results: {}, steps: [], durationMs: 0 };

    const byId = new Map(steps.map((step) => [step.id, step]));
    for (const step of steps) {
      for (const dep of step.dependsOn ?? []) {
        if (!byId.has(dep)) throw new KilnError(`Step "${step.id}" depends on unknown step "${dep}".`);
      }
    }
    detectCycle(steps);

    const pool = new ConcurrencyPool(options.concurrency);
    const outputs: Record<string, unknown> = {};
    const results: Record<string, AgentRunResult> = {};
    const outcomes = new Map<string, PipelineStepOutcome>();
    const settled = new Set<string>();
    const launched = new Set<string>();
    const context: PipelineRunContext = { outputs, results };

    const isReady = (step: PipelineStep): boolean => (step.dependsOn ?? []).every((dep) => settled.has(dep));
    const failedDeps = (step: PipelineStep): string[] => (step.dependsOn ?? []).filter((dep) => outcomes.get(dep)?.status !== "succeeded");

    const runOneStep = async (step: PipelineStep): Promise<void> => {
      const failed = failedDeps(step);
      if (failed.length) {
        outcomes.set(step.id, { id: step.id, status: "skipped", attempts: 0, skippedReason: `dependency failed or was skipped: ${failed.join(", ")}` });
        settled.add(step.id);
        return;
      }

      const isValid = step.isValid ?? defaultIsValid;
      const maxAttempts = 1 + (step.retries ?? options.retries ?? 0);
      let last: AgentRunResult | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resolvedInput = typeof step.input === "function" ? await (step.input as (ctx: PipelineRunContext) => unknown)(context) : step.input;
        last = isInlineDefinition(step.agent)
          ? await this.agentRuntime.runDefinition(step.agent, resolvedInput)
          : await this.agentRuntime.run(step.agent.directory, resolvedInput, { agentName: step.agent.agentName });
        options.onStep?.(step.id, last, attempt);
        if (last.status === "succeeded" && isValid(last.output)) {
          outputs[step.id] = last.output;
          results[step.id] = last;
          outcomes.set(step.id, { id: step.id, status: "succeeded", result: last, attempts: attempt });
          settled.add(step.id);
          return;
        }
        if (attempt === maxAttempts) {
          results[step.id] = last;
          outcomes.set(step.id, { id: step.id, status: "failed", result: last, attempts: attempt });
          settled.add(step.id);
          return;
        }
      }
    };

    await new Promise<void>((resolveAll) => {
      const tryLaunch = (): void => {
        for (const step of steps) {
          if (launched.has(step.id) || !isReady(step)) continue;
          launched.add(step.id);
          void pool.run(() => runOneStep(step)).then(() => {
            tryLaunch();
            if (settled.size === steps.length) resolveAll();
          });
        }
      };
      tryLaunch();
    });

    return { outputs, results, steps: steps.map((step) => outcomes.get(step.id) as PipelineStepOutcome), durationMs: Date.now() - startedAt };
  }
}
