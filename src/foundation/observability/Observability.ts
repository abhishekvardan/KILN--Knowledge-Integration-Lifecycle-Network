export interface Logger { info(message: string, metadata?: Record<string, unknown>): void; error(message: string, metadata?: Record<string, unknown>): void; }
export interface Metrics { increment(name: string, value?: number): void; timing(name: string, milliseconds: number): void; }
export interface TimelineEntry { stage: string; at: Date; }
export class ExecutionTimeline { private readonly entries: TimelineEntry[] = []; mark(stage: string) { this.entries.push({ stage, at: new Date() }); } all() { return [...this.entries]; } }
export class CostTracker { total = 0; add(_amount: number): void { /* provider accounting is intentionally deferred */ } }
export class TokenTracker { total = 0; add(_tokens: number): void { /* provider tokenization is intentionally deferred */ } }
