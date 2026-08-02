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
  publisher?: string;
  installedAt: string;
  packagePath: string;
}

export interface ExecutionPlan {
  packageName: string; version: string; description: string; publisher?: string; runtime: string; entrypoint: string;
  prompts: Record<string, string>; workflows: Record<string, string>; permissions: string[]; compatibility: Record<string, string>;
  variables: Record<string, string>; dependencies: Record<string, string>; metadata: Record<string, unknown>;
}

export interface PackageDetails { manifest: import("./services/AgentManifest.js").AgentManifest; files: string[]; size: number; createdTime: Date; }
