#!/usr/bin/env node
/**
 * The process edge — the ONLY module that touches `process`, signals, and the real Node
 * runtime. Ported from legacy `cli.ts:46-87`, but most of the lifecycle is now the
 * runtime's job:
 *   - argv: `@effect/cli` strips the node/script prefix (legacy did `slice(2)` by hand).
 *   - dispatch: the command tree (`cli.ts`) routes `install` vs default `inspect`.
 *   - exit code: the handlers set `process.exitCode` (RULE-030 via the exit-code slice).
 *
 * What stays here (the carried exit-code contract — RULE-030, legacy `cli.ts:51-84`):
 *   - SIGINT / SIGTERM → exit 130.
 *   - stdout EPIPE (piped into `head` etc.) → exit 0, not a crash.
 *   - an uncaught error → exit 1 with `ts-fix: <message>` on stderr (terse, like
 *     legacy — NOT Effect's default pretty cause dump).
 *
 * `NodeRuntime.runMain` ALSO installs interrupt handling; the explicit signal handlers
 * below pin the EXACT legacy codes (130) so the CI contract is identical regardless of
 * the runtime's default.
 */

import { ValidationError } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { run } from "./cli.js";

/** Install the carried process-edge signal/pipe handlers (RULE-030). */
function installProcessEdge(): void {
  // SIGINT/SIGTERM → 130 (carried exit-code contract, legacy `cli.ts:52-57`).
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      process.exitCode = 130;
      process.exit(130);
    });
  }
  // EPIPE (e.g. piped into `head`) → exit 0, not a crash (legacy `cli.ts:59-61`).
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
  });
}

installProcessEdge();

/**
 * The runnable program: parse + dispatch + run, then map any failure to the legacy terse
 * `ts-fix: <message>` + exit 1. `@effect/cli` `ValidationError`s (bad flags, RULE-028
 * rejections) are surfaced by the runtime's own reporting (non-zero exit); engine/tagged
 * failures are caught here so the message matches legacy's terse style.
 */
const program = run(process.argv).pipe(
  Effect.catchAllCause((cause) =>
    Effect.sync(() => {
      // A clean interrupt (Ctrl+C path that reached here) keeps the signal handler's 130.
      if (Cause.isInterruptedOnly(cause)) {
        process.exitCode = 130;
        return;
      }
      const failure = Cause.failureOption(cause);
      // `@effect/cli` already renders ValidationErrors (unknown/missing flags, RULE-028,
      // mutual-exclusivity) to the terminal as a clean usage message. Re-dumping the raw
      // cause here only produced a redundant `ts-fix: Error: {…JSON…}` line — so for a
      // ValidationError we keep the library's output and just carry the non-zero exit.
      if (failure._tag === "Some" && ValidationError.isValidationError(failure.value)) {
        process.exitCode = 1;
        return;
      }
      const message = Exit.match(Exit.failCause(cause), {
        onFailure: () =>
          failure._tag === "Some" && failure.value instanceof Error
            ? failure.value.message
            : Cause.pretty(cause),
        onSuccess: () => "",
      });
      process.stderr.write(`ts-fix: ${message}\n`);
      process.exitCode = 1;
    }),
  ),
);

// Provide the real Node platform Layer (FileSystem | Path | Terminal | …) and run.
// `disableErrorReporting` so our terse `catchAllCause` message is the only stderr output
// (no duplicate pretty dump from the runtime).
NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)), {
  disableErrorReporting: true,
});
