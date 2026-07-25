import type { Agent } from "../types.js";

/** HTTP boundary for the KILN registry. Mocked until networking is introduced. */
export class RegistryService {
  private readonly catalog: Agent[] = [
    { name: "github-reviewer", description: "Reviews pull requests for common issues.", version: "1.0.0" },
    { name: "security-auditor", description: "Scans projects for security concerns.", version: "1.2.0" },
  ];

  public async search(query: string): Promise<Agent[]> {
    const normalized = query.toLowerCase();
    return this.catalog.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(normalized));
  }
  public async getAgent(name: string): Promise<Agent | undefined> {
    return this.catalog.find((agent) => agent.name === name);
  }
  public async publish(): Promise<{ id: string }> { return { id: "mock-publication-001" }; }
}
