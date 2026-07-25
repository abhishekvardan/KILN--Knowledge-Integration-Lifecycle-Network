export class AgentHubError extends Error {
  public constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AgentHubError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
