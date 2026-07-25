import { z } from "zod";

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const AgentManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case"),
  version: z.string().regex(semver, "must be a valid semantic version"),
  description: z.string().min(1).max(500),
  author: z.string().min(1).optional(),
  license: z.string().min(1).optional(),
}).strict();

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
