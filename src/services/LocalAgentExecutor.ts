import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KilnError } from "../utils/errors.js";

/** Executes an explicitly exported local agent function in an isolated Node process. */
export class LocalAgentExecutor {
  public async execute(packageDirectory: string, input: unknown = {}): Promise<unknown> {
    const entrypoint = resolve(packageDirectory, "src", "agent.ts");
    try { await access(entrypoint); } catch { throw new KilnError(`Executable agent entrypoint not found: ${join(packageDirectory, "src", "agent.ts")}`); }
    const runner = "import { pathToFileURL } from 'node:url'; const agent = await import(pathToFileURL(process.argv[1]).href); if (typeof agent.execute !== 'function') throw new Error('Agent must export an async execute(input) function.'); const value = await agent.execute(JSON.parse(process.argv[2])); console.log(JSON.stringify(value));";
    return new Promise((resolveResult, reject) => {
      const tsxLoader = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));
      const kilnRoot = fileURLToPath(new URL("../..", import.meta.url));
      const child = spawn(process.execPath, ["--import", pathToFileURL(tsxLoader).href, "-e", runner, entrypoint, JSON.stringify(input)], { cwd: kilnRoot, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", (error) => reject(new KilnError("Unable to start local agent process.", error)));
      child.on("close", (code) => { if (code !== 0) return reject(new KilnError(stderr.trim() || `Agent process exited with code ${code}.`)); try { resolveResult(JSON.parse(stdout.trim())); } catch (error) { reject(new KilnError("Agent did not return JSON output.", error)); } });
    });
  }
}
