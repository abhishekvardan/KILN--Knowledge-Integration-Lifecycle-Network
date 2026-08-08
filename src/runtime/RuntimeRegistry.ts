import type { Connector } from "./interfaces/Connector.js";
import type { ProviderAdapter } from "./interfaces/ProviderAdapter.js";
import type { Tool } from "./interfaces/Tool.js";
import type { Workflow } from "./WorkflowManager.js";

export class RuntimeRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();
  private readonly tools = new Map<string, Tool>();
  private readonly connectors = new Map<string, Connector>();
  private readonly workflows = new Map<string, Workflow>();
  private readonly agents = new Map<string, unknown>();

  registerProvider(item: ProviderAdapter) { this.providers.set(item.name, item); }
  provider(name: string) { return this.providers.get(name); }
  providersList(): ProviderAdapter[] { return [...this.providers.values()]; }

  registerTool(item: Tool) { this.tools.set(item.name, item); }
  tool(name: string) { return this.tools.get(name); }
  toolsList(): Tool[] { return [...this.tools.values()]; }

  registerConnector(item: Connector) { this.connectors.set(item.name, item); }
  connector(name: string) { return this.connectors.get(name); }
  connectorsList(): Connector[] { return [...this.connectors.values()]; }

  registerWorkflow(item: Workflow) { this.workflows.set(item.id, item); }
  workflow(id: string) { return this.workflows.get(id); }
  workflowsList(): Workflow[] { return [...this.workflows.values()]; }

  registerAgent(name: string, item: unknown) { this.agents.set(name, item); }
  agent(name: string) { return this.agents.get(name); }
  agentsList(): { name: string; definition: unknown }[] {
    return [...this.agents.entries()].map(([name, definition]) => ({ name, definition }));
  }
}

