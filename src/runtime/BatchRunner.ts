import { randomUUID } from "node:crypto";
import { AgentRuntime, type AgentRunResult } from "./AgentRuntime.js";
import { ConcurrencyPool } from "./ConcurrencyPool.js";

/** `directory` is omitted when resolution already failed (e.g. package not installed) — `resolutionError` carries why. */
export interface BatchTarget { name: string; directory?: string; agentName?: string; resolutionError?: string }
export interface BatchRunItem { name: string; result: AgentRunResult }
export interface BatchRunOptions { concurrency?: number; onResult?: (item: BatchRunItem) => void }

/** Runs many agents concurrently (capped by ConcurrencyPool) through a single AgentRuntime — the same pool whether the 200 targets are 200 different packages or 200 agents inside one. */
export class BatchRunner {
  public constructor(private readonly agentRuntime: AgentRuntime) {}

  public async run(targets: BatchTarget[], input: unknown, options: BatchRunOptions = {}): Promise<BatchRunItem[]> {
    const pool = new ConcurrencyPool(options.concurrency);
    return Promise.all(targets.map((target) => pool.run(async () => {
      const result: AgentRunResult = target.resolutionError
        ? { runId: randomUUID(), status: "failed", error: target.resolutionError, durationMs: 0, agentName: target.agentName }
        : await this.agentRuntime.run(target.directory as string, input, { agentName: target.agentName });
      const item: BatchRunItem = { name: target.name, result };
      options.onResult?.(item);
      return item;
    })));
  }
}
