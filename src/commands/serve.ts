import { Command } from "commander";
import chalk from "chalk";
import { ConfigService } from "../services/ConfigService.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import { EventBus } from "../runtime/EventBus.js";
import { RunRecorder } from "../runtime/RunRecorder.js";
import { createServer } from "../server/createServer.js";

export function registerServeCommand(program: Command, config: ConfigService, agentRuntime: AgentRuntime, events: EventBus, recorder: RunRecorder): void {
  program.command("serve").option("--port <number>", "Port to listen on", "3000").description("Run an HTTP API for running and monitoring agents from another backend").action(async (options: { port: string }) => {
    const app = await createServer({ config, agentRuntime, events, recorder });
    const port = Number(options.port);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(chalk.green(`kiln serve listening on http://localhost:${port}`));
    console.log(`API docs: http://localhost:${port}/docs`);
  });
}
