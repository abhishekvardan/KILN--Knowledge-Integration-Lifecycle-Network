import type { Connector } from "../../runtime/interfaces/Connector.js";

export interface DefineConnectorOptions<TConfig> {
  name: string;
  connect?(config?: TConfig): Promise<void>;
  authenticate?(): Promise<void>;
  validate?(): Promise<void>;
  disconnect?(): Promise<void>;
}

const noop = async (): Promise<void> => {};

export function defineConnector<TConfig = unknown>(options: DefineConnectorOptions<TConfig>): Connector<TConfig> {
  return {
    name: options.name,
    connect: options.connect ?? noop,
    authenticate: options.authenticate ?? noop,
    validate: options.validate ?? noop,
    disconnect: options.disconnect ?? noop,
  };
}
