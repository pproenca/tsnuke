/**
 * The command tree assembly — `inspect` (the default command) with `install` as a
 * subcommand — and the `Command.run` runner.
 *
 * Legacy `cli.ts` dispatched manually: first token `"install"` → `runInstall`, else
 * `runInspect` (treating a leading `"inspect"` as optional). On `@effect/cli` the
 * default command IS `inspect` and `install` is a registered subcommand; the library's
 * POSIX dispatcher routes `tsnuke install …` to the subcommand and everything else
 * (incl. a bare directory + flags) to the root `inspect` handler. `--help` / completions
 * are provided automatically (new capability vs the hand-rolled parser).
 *
 * `run` yields an `Effect` requiring `CliApp.Environment` (`FileSystem | Path |
 * Terminal`); the entry (`bin.ts` / tests) provides that Layer.
 */

import { Command } from "@effect/cli";
import { inspectCommand, VERSION } from "./inspectCommand.js";
import { installCommand } from "./installCommand.js";

/** The full command tree: `inspect` root + `install` subcommand. */
export const command = inspectCommand.pipe(Command.withSubcommands([installCommand]));

/**
 * Build the argv runner. Returns a function `argv → Effect<void, …, Environment>`. The
 * caller (`bin.ts`) supplies the FULL argv (incl. the node/script prefix) — `@effect/cli`
 * strips the prefix itself, unlike legacy which sliced `process.argv.slice(2)` by hand.
 */
export const run = Command.run(command, {
  name: "tsnuke",
  version: VERSION,
});
