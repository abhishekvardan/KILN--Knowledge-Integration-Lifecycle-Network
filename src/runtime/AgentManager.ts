import { RuntimeRegistry } from "./RuntimeRegistry.js";
export class AgentManager { public constructor(private readonly registry: RuntimeRegistry) {} register(name: string, agent: unknown) { this.registry.registerAgent(name, agent); } resolve(name?: string) { return name ? this.registry.agent(name) : undefined; } }
