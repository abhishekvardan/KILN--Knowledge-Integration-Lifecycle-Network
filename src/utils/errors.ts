export class KilnError extends Error {
  public constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "KilnError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
