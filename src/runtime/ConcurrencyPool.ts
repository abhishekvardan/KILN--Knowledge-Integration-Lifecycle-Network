const DEFAULT_LIMIT = Number(process.env.KILN_CONCURRENCY) || 20;

/** Caps how many async jobs run at once; excess jobs queue and run as slots free up. */
export class ConcurrencyPool {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  public constructor(private readonly limit = DEFAULT_LIMIT) {}

  public async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await work(); }
    finally { this.release(); }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) { this.active++; return; }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}
