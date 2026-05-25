/**
 * The `install` subcommand (RULE-038), built on `@effect/cli`. Declares the legacy flag
 * surface (`--yes`/`-y`, `--dry-run`, `--agent-hooks`, `--cwd`) as `Options` and runs
 * {@link runInstall} over the real Node `FileSystem` via the `Terminal` writer.
 *
 * PRESERVED DEFECT (RULE-038): the written `pre-push` hook is INERT and clobbering — see
 * installHandler.ts + TRANSFORMATION_NOTES.md. Not silently fixed.
 */

import { Command, Options } from "@effect/cli";
import { Path, Terminal } from "@effect/platform";
import { Effect, Option } from "effect";
import { runInstall, type InstallFlags } from "./installHandler.js";

const yesOpt = Options.boolean("yes").pipe(
  Options.withAlias("y"),
  Options.withDescription("Assume yes to prompts."),
);
const dryRunOpt = Options.boolean("dry-run").pipe(
  Options.withDescription("Describe the planned writes without performing them."),
);
const agentHooksOpt = Options.boolean("agent-hooks").pipe(
  Options.withDescription("Also write a native agent hook config (STUB — RULE-038)."),
);
const cwdOpt = Options.directory("cwd").pipe(
  Options.optional,
  Options.withDescription("Target directory (default: the current working directory)."),
);

/**
 * The `install` command. Resolves the `--cwd` default to the process cwd (via the `Path`
 * service / `process.cwd()`), runs the effectful installer over the real FileSystem, and
 * sets exit code 0 (install never gates — RULE-038).
 */
export const installCommand = Command.make(
  "install",
  { yes: yesOpt, dryRun: dryRunOpt, agentHooks: agentHooksOpt, cwd: cwdOpt },
  ({ yes, dryRun, agentHooks, cwd }) =>
    Effect.gen(function* () {
      const flags: InstallFlags = {
        cwd: Option.getOrElse(cwd, () => process.cwd()),
        yes,
        dryRun,
        agentHooks,
      };
      const terminal = yield* Terminal.Terminal;
      const code = yield* runInstall(flags, (text) =>
        terminal.display(text).pipe(Effect.orDie),
      );
      process.exitCode = code;
    }),
).pipe(
  // `runInstall` requires `Path`; provide it here (the FileSystem comes from the runtime
  // Layer at the entry). `Path.layer` is the pure platform-agnostic path service.
  Command.provide(Path.layer),
  Command.withDescription("Install the ts-doctor agent skill + a (stub) git pre-push hook."),
);
