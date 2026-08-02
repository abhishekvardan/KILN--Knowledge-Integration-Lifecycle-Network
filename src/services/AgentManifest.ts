import { z } from "zod";

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const stringMap = z.record(z.string());

/** v0.3 manifest. Runtime defaults retain compatibility with v0.2 packages. */
export const AgentManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case"),
  version: z.string().regex(semver, "must be a valid semantic version"),
  description: z.string().min(1).max(500),
  publisher: z.string().min(1).optional(), author: z.string().optional(), license: z.string().min(1).optional(),
  homepage: z.string().url().optional(), repository: z.string().url().optional(), keywords: z.array(z.string().min(1)).default([]), icon: z.string().min(1).optional(),
  runtime: z.string().min(1).default("prompt"), entrypoint: z.string().min(1).default("prompts/system.md"),
  permissions: z.array(z.string().min(1)).default([]), compatibility: stringMap.default({}), variables: stringMap.default({}), dependencies: stringMap.default({}),
  provider: z.string().default("prompt"), model: z.string().optional(), memory: z.string().default("short-term"), capabilities: z.array(z.string().min(1)).default([]), dependsOn: z.array(z.string().min(1)).default([]), inputs: stringMap.default({}), outputs: stringMap.default({}),
}).strict();

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
