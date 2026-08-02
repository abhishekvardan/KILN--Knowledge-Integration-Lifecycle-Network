export class Scheduler { async schedule<T>(work: () => Promise<T>): Promise<T> { return work(); } }
