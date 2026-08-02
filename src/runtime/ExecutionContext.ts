export interface ExecutionContext { executionId: string; request: string; startedAt: Date; variables: Record<string, string>; memory: Record<string, unknown>; }
