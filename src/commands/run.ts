import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { ConfigService } from "../services/ConfigService.js";
import { AgentRuntime } from "../runtime/AgentRuntime.js";
import { BatchRunner } from "../runtime/BatchRunner.js";
import { expandRunTargets } from "../runtime/resolveTargets.js";
import { KilnError, toErrorMessage } from "../utils/errors.js";

export function registerRunCommand(program: Command, config: ConfigService, agentRuntime: AgentRuntime): void {
  program.command("run [targets...]")
    .option("--all", "Run every agent in every installed package")
    .option("--query <query>", "Agent query input")
    .option("--concurrency <number>", "Maximum concurrent agent runs", "20")
    .description("Execute agents concurrently. A target is \"package\" (all its agents) or \"package:agent\" (one).")
    .action(async (packages: string[], options: { all?: boolean; query?: string; concurrency: string }) => {
      const installed = await config.getInstalled();
      const specs = options.all ? installed.agents.map((agent) => agent.name) : packages;
      if (!specs.length) throw new KilnError("Specify at least one target (\"package\" or \"package:agent\"), or pass --all.");
      const targets = await expandRunTargets(installed.agents, agentRuntime, specs);

      const batchRunner = new BatchRunner(agentRuntime);
      const spinner = ora(`Running ${targets.length} agent${targets.length === 1 ? "" : "s"}...`).start();
      let completed = 0;
      try {
        const results = await batchRunner.run(targets, { query: options.query }, {
          concurrency: Number(options.concurrency),
          onResult: (item) => { completed += 1; spinner.text = `${completed}/${targets.length} complete — last: ${item.name} (${item.result.status})`; },
        });
        spinner.stop();

        console.log(chalk.cyan("Run Summary"));
        for (const { name, result } of results) {
          const marker = result.status === "succeeded" ? chalk.green("PASS") : chalk.red("FAIL");
          console.log(`${marker} ${name}  ${result.durationMs}ms  run ${result.runId}`);
          if (result.status === "failed") console.log(chalk.red(`  ${result.error}`));
          else if (result.output && typeof result.output === "object" && "markdown" in result.output) console.log(`  ${String((result.output as { markdown: unknown }).markdown)}`);
        }

        const failed = results.filter((item) => item.result.status === "failed").length;
        console.log(chalk.cyan(`\n${results.length - failed}/${results.length} succeeded`));
        if (failed) process.exitCode = 1;
      } catch (error) {
        spinner.fail(toErrorMessage(error));
        throw error;
      } finally {
        if (spinner.isSpinning) spinner.stop();
      }
    });
}
