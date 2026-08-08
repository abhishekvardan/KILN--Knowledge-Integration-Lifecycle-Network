import { Command } from "commander";
import chalk from "chalk";
import { RunRecorder } from "../runtime/RunRecorder.js";
import { KilnError } from "../utils/errors.js";

export function registerLogsCommand(program: Command, recorder: RunRecorder): void {
  program.command("logs <runId>").description("Replay a single agent run's recorded event timeline").action(async (runId: string) => {
    const record = await recorder.load(runId);
    if (!record) throw new KilnError(`No recorded run found for "${runId}".`);
    console.log(chalk.cyan(`Run ${record.runId}`), record.status === "succeeded" ? chalk.green(record.status) : chalk.red(record.status ?? "in-progress"));
    for (const event of record.events) console.log(`${new Date(event.at).toISOString()}  ${event.type}  ${JSON.stringify(event.payload ?? {})}`);
  });
}
