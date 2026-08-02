import type { RuntimeMiddleware, FoundationContext } from "../runtime/Middleware.js";
export interface CheckpointStore { save(id: string, value: unknown): Promise<void>; }
export class CheckpointMiddleware implements RuntimeMiddleware { public readonly name = "checkpoint"; public constructor(private readonly store: CheckpointStore) {} async execute(context: FoundationContext, next: () => Promise<void>): Promise<void> { await next(); await this.store.save(context.executionId, context); } }
