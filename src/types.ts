export interface Agent {
  name: string;
  description: string;
  version: string;
}

export interface AppConfig {
  authToken?: string;
  registryUrl: string;
  [key: string]: string | undefined;
}

export interface InstalledAgents {
  agents: InstalledAgent[];
}

export interface InstalledAgent extends Agent {
  installedAt: string;
  packagePath: string;
}
