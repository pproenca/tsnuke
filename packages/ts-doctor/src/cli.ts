#!/usr/bin/env node
/**
 * CLI entry point — the only module that touches `process`, stdout/stderr, and
 * the filesystem at the top level. It parses `process.argv`, dispatches to a
 * command, and maps the command's intended exit code onto `process.exitCode`.
 *
 * All real logic lives in the pure/seamed modules (`flags`, `commands/*`) so it
 * can be unit-tested without spawning a process. Arg parsing is NOT done inline
 * here — `cli.ts` only strips the node/script prefix and the command word.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { runInspect } from "./commands/inspect.js";
import type { InspectIo } from "./commands/inspect.js";
import { parseInstallFlags, runInstall } from "./commands/install.js";
import type { InstallIo } from "./commands/install.js";

/** Best-effort package version for the JSON report; defaults if unreadable. */
const VERSION = "0.0.0";

/** Process-backed IO for `inspect` (the only place fs/stdout are wired). */
function makeInspectIo(): InspectIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    files: {
      read: (filePath) => readFileSync(filePath, "utf8"),
      write: (filePath, contents) => writeFileSync(filePath, contents, "utf8"),
    },
  };
}

/** Process-backed IO for `install`. */
function makeInstallIo(): InstallIo {
  return {
    stdout: (text) => process.stdout.write(text),
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, "utf8");
    },
  };
}

async function main(): Promise<void> {
  // argv[0]=node, argv[1]=script; the rest are user args.
  const args = process.argv.slice(2);
  const [maybeCommand, ...rest] = args;

  // SIGINT/SIGTERM → 130 (carried exit-code contract).
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      process.exitCode = 130;
      process.exit(130);
    });
  }
  // EPIPE (e.g. piped into `head`) → exit 0, not a crash.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
  });

  try {
    if (maybeCommand === "install") {
      const flags = parseInstallFlags(rest, process.cwd());
      process.exitCode = runInstall(flags, makeInstallIo());
      return;
    }

    // Default command is `inspect`. If the first token is literally "inspect",
    // drop it; otherwise treat all args as inspect args (directory + flags).
    const inspectArgs = maybeCommand === "inspect" ? rest : args;
    process.exitCode = await runInspect({
      argv: inspectArgs,
      io: makeInspectIo(),
      version: VERSION,
    });
  } catch (err) {
    // Uncaught error → exit 1. In JSON mode core/inspect would have emitted a
    // structured `{ok:false}` already; here we surface a terse message.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ts-doctor: ${message}\n`);
    process.exitCode = 1;
  }
}

void main();
