import type { InstalledAgent } from "../types.js";
import { AgentRuntime } from "./AgentRuntime.js";
import type { BatchTarget } from "./BatchRunner.js";

/**
 * Expands run specs ("package" or "package:agent") into concrete BatchTargets. A bare "package" with no
 * ":agent" suffix expands to every agent that package defines — this is what lets `kiln run my-package`
 * fan out across 200 agents defined inside one `kiln init` project, instead of requiring 200 separate ones.
 *
 * Never throws: an unresolvable spec (not installed, no agents defined, ...) becomes a target with
 * `resolutionError` set instead, so one bad spec shows up as one failed row in the batch results rather
 * than aborting every other target in the same `kiln run` / `run-batch` call.
 */
export async function expandRunTargets(installed: InstalledAgent[], agentRuntime: AgentRuntime, specs: string[]): Promise<BatchTarget[]> {
  const targets: BatchTarget[] = [];
  for (const spec of specs) {
    const separatorIndex = spec.indexOf(":");
    const packageName = separatorIndex === -1 ? spec : spec.slice(0, separatorIndex);
    const agentName = separatorIndex === -1 ? undefined : spec.slice(separatorIndex + 1);
    const entry = installed.find((agent) => agent.name === packageName);
    if (!entry) { targets.push({ name: spec, resolutionError: `Agent "${packageName}" is not installed.` }); continue; }

    if (agentName) {
      targets.push({ name: `${packageName}:${agentName}`, directory: entry.packagePath, agentName });
      continue;
    }
    const agents = await agentRuntime.listAgents(entry.packagePath);
    if (!agents.length) { targets.push({ name: packageName, directory: entry.packagePath, resolutionError: `"${packageName}" has no runnable agents (expected src/agent.ts or src/agents/*.ts).` }); continue; }
    for (const agent of agents) targets.push(agent.agentName ? { name: `${packageName}:${agent.agentName}`, directory: entry.packagePath, agentName: agent.agentName } : { name: packageName, directory: entry.packagePath });
  }
  return targets;
}
