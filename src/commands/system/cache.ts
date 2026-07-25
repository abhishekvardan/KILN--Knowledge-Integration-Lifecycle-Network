import { Command } from "commander";
import ora from "ora";
import { CacheService } from "../../services/CacheService.js";
import { ConfigService } from "../../services/ConfigService.js";
import { toErrorMessage } from "../../utils/errors.js";
import { output } from "../../utils/output.js";
export function registerCacheCommand(program: Command, config: ConfigService, cache: CacheService): void { const command = program.command("cache").description("Manage local registry cache"); command.command("info").action(async () => { const info = await cache.getInfo(config.cacheDirectory); output.info(`Cache: ${info.files} files, ${info.bytes} bytes`); }); command.command("clean").action(async () => { const spinner = ora("Cleaning cache...").start(); try { await cache.clean(config.cacheDirectory); spinner.succeed("Cache cleaned."); } catch (error) { spinner.fail(toErrorMessage(error)); throw error; } finally { if (spinner.isSpinning) spinner.stop(); } }); }
