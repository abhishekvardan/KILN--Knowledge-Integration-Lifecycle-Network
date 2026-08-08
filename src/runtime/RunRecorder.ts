import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventBus, type RuntimeEvent, type RuntimeEventType } from "./EventBus.js";

export interface RunRecord { runId: string; status?: "succeeded" | "failed"; events: RuntimeEvent[]; finishedAt?: string }

const RECORDED_TYPES: RuntimeEventType[] = ["AgentStarted", "AgentLog", "AgentCompleted", "AgentFailed"];

/** Subscribes to the EventBus and persists each run's event timeline to disk so it stays inspectable after the process exits. */
export class RunRecorder {
  private readonly records = new Map<string, RunRecord>();

  public constructor(events: EventBus, private readonly directory: string) {
    for (const type of RECORDED_TYPES) events.on(type, (event) => this.onEvent(type, event));
  }

  /** In-memory record for a run started in this process (includes runs still in progress). */
  public get(runId: string): RunRecord | undefined { return this.records.get(runId); }

  public async load(runId: string): Promise<RunRecord | undefined> {
    try { return JSON.parse(await readFile(join(this.directory, `${runId}.json`), "utf8")) as RunRecord; }
    catch { return undefined; }
  }

  /** In-memory first (covers in-progress runs), falling back to the persisted record on disk. */
  public async find(runId: string): Promise<RunRecord | undefined> { return this.get(runId) ?? this.load(runId); }

  private onEvent(type: RuntimeEventType, event: RuntimeEvent): void {
    const record = this.records.get(event.executionId) ?? { runId: event.executionId, events: [] };
    record.events.push(event);
    if (type === "AgentCompleted") record.status = "succeeded";
    if (type === "AgentFailed") record.status = "failed";
    this.records.set(event.executionId, record);
    if (type === "AgentCompleted" || type === "AgentFailed") {
      record.finishedAt = new Date().toISOString();
      void this.flush(record);
    }
  }

  private async flush(record: RunRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, `${record.runId}.json`), JSON.stringify(record, null, 2));
  }
}
