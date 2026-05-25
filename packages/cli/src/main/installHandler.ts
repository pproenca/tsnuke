/**
 * `ts-fix install` (RULE-038) — re-imagined over `@effect/platform` `FileSystem`.
 *
 * PRESERVED-DEFECT NOTICE (RULE-038, confirmed): the git `pre-push` hook this writes is
 * INERT — its body is `# TODO …\nexit 0`, so a user who runs `install` gets a hook that
 * silently does nothing (false CI/local protection), AND it CLOBBERS any existing
 * `pre-push` unconditionally (assessment Security Low). This is preserved VERBATIM here
 * (the equivalence bar) and flagged as a follow-up in TRANSFORMATION_NOTES.md — NOT
 * silently "fixed", per the brief.
 *
 * `buildSkillMarkdown` / `planInstall` are PURE + deterministic (ported verbatim from
 * legacy `commands/install.ts`); `runInstall` is the effectful shell over the
 * `@effect/platform` `FileSystem` + `Path` services (production: `NodeContext`; tests:
 * in-memory Layer). `install` ALWAYS returns exit 0; `--dry-run` describes without
 * writing. Writes go through `makeDirectory({ recursive })` + `writeFileString` (mirrors
 * legacy's `mkdirSync(dirname,…)` + `writeFileSync`).
 */

import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";

/** Flags for `install` (legacy `install.ts:15-24`). */
export interface InstallFlags {
  /** Target directory (default cwd). */
  cwd: string;
  /** Skip confirmation prompts. */
  yes: boolean;
  /** Print planned actions without writing anything. */
  dryRun: boolean;
  /** Also install native agent hooks (Claude Code / Cursor). */
  agentHooks: boolean;
}

/** A planned file write (so dry-run can describe it without performing it). */
export interface PlannedWrite {
  path: string;
  contents: string;
  description: string;
}

/**
 * Build the agent skill markdown. Pure + deterministic. Ported VERBATIM from legacy
 * `install.ts:69-108` (the SKILL.md trigger-spec + command-recipe shape).
 */
export function buildSkillMarkdown(): string {
  return [
    "---",
    "name: ts-fix",
    "description: >-",
    "  Run a TypeScript health check before finishing a change. Surfaces type-safety,",
    "  async, module-boundary, and strictness issues with machine-applicable fixes.",
    "triggers:",
    "  - after editing one or more .ts/.tsx files",
    "  - before opening a PR or pushing",
    "  - when asked to 'check types' or 'audit the TypeScript'",
    "---",
    "",
    "# ts-fix",
    "",
    "Run ts-fix in agent mode for a deduplicated, fix-sorted report:",
    "",
    "```sh",
    "npx ts-fix --format agent",
    "```",
    "",
    "Regression-check only what changed (diff against the base branch):",
    "",
    "```sh",
    "npx ts-fix --diff",
    "```",
    "",
    "Apply the safe auto-fixes, then re-scan and loop until the score stops improving:",
    "",
    "```sh",
    "npx ts-fix --fix --format agent",
    "```",
    "",
    "Notes:",
    "- The score is local and deterministic; compare only same-scale scores",
    "  (a `scorePartial` run is NOT comparable to a full run).",
    "- Apply `auto-fix` edits first (cheapest), then `codemod`, then `manual`.",
    "",
  ].join("\n");
}

/**
 * Compute the set of writes `install` would perform (no IO). Pure/testable. Ported
 * VERBATIM from legacy `install.ts:111-139` — INCLUDING the inert pre-push stub body
 * (RULE-038 preserved-defect) and the `{}` agent-hook config under `--agent-hooks`.
 */
export function planInstall(flags: InstallFlags): PlannedWrite[] {
  const writes: PlannedWrite[] = [
    {
      path: `${flags.cwd}/.agent/skills/ts-fix/SKILL.md`,
      contents: buildSkillMarkdown(),
      description: "agent skill (trigger spec + command recipe)",
    },
  ];

  // PRESERVED DEFECT (RULE-038): an inert, clobbering pre-push hook. TODO(P1): real,
  // non-blocking, hook-chain-respecting install — see TRANSFORMATION_NOTES Follow-up.
  writes.push({
    path: `${flags.cwd}/.git/hooks/pre-push`,
    contents: "#!/bin/sh\n# TODO(P1): non-blocking ts-fix pre-push check\nexit 0\n",
    description: "git pre-push hook (STUB — non-blocking)",
  });

  // TODO(P1): when --agent-hooks, emit Claude Code / Cursor native hook configs.
  if (flags.agentHooks) {
    writes.push({
      path: `${flags.cwd}/.claude/hooks/ts-fix.json`,
      contents: "{}\n",
      description: "native agent hook config (STUB)",
    });
  }

  return writes;
}

/**
 * Run `install` over the `@effect/platform` `FileSystem` + `Path` services. In
 * `--dry-run` it only DESCRIBES the planned writes (writes nothing). Returns 0 always
 * (install never gates — RULE-038). Each real write ensures its parent directory
 * (`makeDirectory({ recursive: true })`) then `writeFileString`s, mirroring legacy's
 * `mkdirSync(dirname, { recursive }) + writeFileSync`. `stdout` is the injected writer
 * (Terminal in production, an in-memory sink in tests).
 */
export const runInstall = Effect.fn("Cli.install")(function* (
  flags: InstallFlags,
  stdout: (text: string) => Effect.Effect<void>,
) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* Effect.forEach(planInstall(flags), (w) =>
      flags.dryRun
        ? stdout(`[dry-run] would write ${w.path} — ${w.description}\n`)
        : Effect.gen(function* () {
            yield* fs.makeDirectory(path.dirname(w.path), { recursive: true });
            yield* fs.writeFileString(w.path, w.contents);
            yield* stdout(`wrote ${w.path} — ${w.description}\n`);
          }),
    );
    return 0 as const;
  });
