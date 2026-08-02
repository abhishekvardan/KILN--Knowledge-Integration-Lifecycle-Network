import type { Connector } from "./interfaces/Connector.js"; import { RuntimeRegistry } from "./RuntimeRegistry.js";
export class ConnectorManager { public constructor(private readonly registry: RuntimeRegistry) {} register(connector: Connector) { this.registry.registerConnector(connector); } resolve(name: string) { return this.registry.connector(name); } }
