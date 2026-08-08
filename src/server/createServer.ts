import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ConfigService } from "../services/ConfigService.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import { BatchRunner } from "../runtime/BatchRunner.js";
import { expandRunTargets } from "../runtime/resolveTargets.js";
import { RunRecorder } from "../runtime/RunRecorder.js";
import { EventBus, type RuntimeEvent, type RuntimeEventType } from "../runtime/EventBus.js";
import { KilnError, toErrorMessage } from "../utils/errors.js";

export interface ServerDependencies { config: ConfigService; agentRuntime: AgentRuntime; events: EventBus; recorder: RunRecorder }

const STREAMED_EVENT_TYPES: RuntimeEventType[] = ["AgentStarted", "AgentLog", "AgentCompleted", "AgentFailed"];

/** Lets a developer's own backend run and monitor kiln agents over HTTP instead of shelling out to the CLI. */
export async function createServer({ config, agentRuntime, events, recorder }: ServerDependencies) {
  const app = Fastify({ logger: false });
  await app.register(cors);
  await app.register(swagger, { openapi: { info: { title: "KILN API", version: "0.1.0", description: "Run and monitor local KILN agents over HTTP." } } });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((error, _request, reply) => {
    reply.code(error instanceof KilnError ? 400 : 500).send({ error: toErrorMessage(error) });
  });

  /** "package" or "package:agent" -> the installed package's directory + which agent inside it (if given). */
  const parseTarget = async (target: string): Promise<{ directory: string; agentName?: string }> => {
    const separatorIndex = target.indexOf(":");
    const packageName = separatorIndex === -1 ? target : target.slice(0, separatorIndex);
    const agentName = separatorIndex === -1 ? undefined : target.slice(separatorIndex + 1);
    const installed = (await config.getInstalled()).agents.find((agent) => agent.name === packageName);
    if (!installed) throw new KilnError(`Agent "${packageName}" is not installed.`);
    return { directory: installed.packagePath, agentName };
  };

  app.get("/agents", async () => {
    const installed = (await config.getInstalled()).agents;
    return Promise.all(installed.map(async (agent) => ({ ...agent, agents: (await agentRuntime.listAgents(agent.packagePath)).map((a) => a.agentName ?? "default") })));
  });

  app.post<{ Params: { name: string }; Body: { input?: unknown }; Querystring: { sync?: string } }>("/agents/:name/run", async (request, reply) => {
    const { directory, agentName } = await parseTarget(request.params.name);
    const runId = randomUUID();
    const pending = agentRuntime.run(directory, request.body?.input ?? {}, { runId, agentName });
    if (request.query.sync === "true") return pending;
    pending.catch(() => {});
    reply.code(202);
    return { runId };
  });

  app.post<{ Body: { names: string[]; input?: unknown; concurrency?: number } }>("/agents/run-batch", async (request) => {
    if (!request.body?.names?.length) throw new KilnError("Provide at least one target in \"names\" (\"package\" or \"package:agent\").");
    const installed = (await config.getInstalled()).agents;
    const targets = await expandRunTargets(installed, agentRuntime, request.body.names);
    const results = await new BatchRunner(agentRuntime).run(targets, request.body.input ?? {}, { concurrency: request.body.concurrency });
    return { results };
  });

  app.get<{ Params: { runId: string } }>("/runs/:runId", async (request, reply) => {
    const record = await recorder.find(request.params.runId);
    if (!record) return reply.code(404).send({ error: `No recorded run found for "${request.params.runId}".` });
    return record;
  });

  app.get<{ Params: { runId: string } }>("/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params;
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });

    const existing = recorder.get(runId);
    for (const event of existing?.events ?? []) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    if (existing?.status) { reply.raw.end(); return; }

    const unsubscribers = STREAMED_EVENT_TYPES.map((type) => events.on(type, (event: RuntimeEvent) => {
      if (event.executionId !== runId) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      if (type === "AgentCompleted" || type === "AgentFailed") { unsubscribers.forEach((off) => off()); reply.raw.end(); }
    }));
    request.raw.on("close", () => unsubscribers.forEach((off) => off()));
  });

  return app;
}
