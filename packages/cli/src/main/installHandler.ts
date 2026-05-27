/**
 * `tsnuke install` — write the agent skill + a real, non-blocking git pre-push hook.
 *
 * `buildSkillMarkdown` is now a thin wrapper that delegates to the shared
 * `buildAgentsMarkdown` (format slice) — the SAME markdown the `tsnuke agents`
 * subcommand emits to stdout. One builder, two consumers: the on-demand
 * briefing and the on-disk SKILL.md never drift.
 *
 * ── Pre-push hook (was: preserved-defect RULE-038) ────────────────────────────
 * The old install wrote `# TODO\nexit 0` (inert) and silently CLOBBERED any
 * existing hook. That false-protection footgun is now fixed:
 *
 *   - If `.git/hooks/pre-push` does not exist, write a real non-blocking hook:
 *     `npx --no tsnuke --score || true; exit 0`. Always exits 0 so a
 *     push is never blocked; surfaces the score so a drop is visible.
 *   - If `.git/hooks/pre-push` exists and carries our marker line
 *     (`# tsnuke-managed v1`), treat as idempotent — overwrite is safe.
 *   - If `.git/hooks/pre-push` exists with a DIFFERENT body, REFUSE to clobber:
 *     emit a one-line warning telling the user how to integrate manually, and
 *     return exit 0 (install never gates — RULE-038).
 */

import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { RuleMeta } from "@tsnuke/contracts-effect";
import { buildAgentsMarkdown } from "@tsnuke/format-effect";
import { graphRuleRegistry, ruleRegistry } from "@tsnuke/rules-registry-effect";

/** Flags for `install`. */
export interface InstallFlags {
  /** Target directory (default cwd). */
  cwd: string;
  /** Skip confirmation prompts. */
  yes: boolean;
  /** Print planned actions without writing anything. */
  dryRun: boolean;
  /** Also install native agent hooks (Claude Code / Cursor) — still a stub. */
  agentHooks: boolean;
}

/** A planned file write — kept for `--dry-run` to describe without performing. */
export interface PlannedWrite {
  path: string;
  contents: string;
  description: string;
}

/** Marker line embedded in the hook so re-installs are idempotent. */
const HOOK_MARKER = "# tsnuke-managed v2" as const;
/** Predecessor markers we still recognise as tsnuke-managed (safe to upgrade). */
const LEGACY_HOOK_MARKERS = ["# tsnuke-managed v1"] as const;
/** True if the existing hook body is one we wrote ourselves (any version). */
const isTsnukeOwnedHook = (text: string): boolean =>
  text.includes(HOOK_MARKER) || LEGACY_HOOK_MARKERS.some((m) => text.includes(m));

/**
 * The real pre-push hook body. Non-blocking: always exits 0.
 *
 * P6: defaults to `--diff` (regression check) so the hook runs fast on every
 * push and surfaces a score line only for files changed in this push. The
 * full-tree scan is a separate, explicit ask (`/tsnuke` → playbook → `full`
 * scope). The marker version bump (`v1` → `v2`) lets the install command
 * recognise + replace previous tsnuke-managed hooks without clobbering
 * user-authored hooks.
 */
export const PRE_PUSH_HOOK = `#!/bin/sh
${HOOK_MARKER} — non-blocking regression check on push.
# Update by re-running \`npx tsnuke install\`.
npx --no tsnuke --diff --score 2>&1 || true
exit 0
` as const;

/**
 * The full tsnuke rule catalog (per-file + graph) — the input to the shared
 * `buildAgentsMarkdown` builder. The same two lines appear in `agentsCommand.ts`;
 * both call sites read from the global registries so the briefing emitted to
 * stdout (`tsnuke agents`) and the SKILL.md written to disk (`tsnuke install`)
 * are byte-identical.
 */
const allRules = (): ReadonlyArray<RuleMeta> => [...ruleRegistry, ...graphRuleRegistry];

/**
 * Compute the set of writes `install` would perform IF the pre-push hook is
 * absent or marker-owned. Pure; the actual hook-existence check happens in
 * {@link runInstall}, so callers using `planInstall` for `--dry-run` still get
 * the canonical write set.
 */
export function planInstall(flags: InstallFlags): PlannedWrite[] {
  const writes: PlannedWrite[] = [
    {
      path: `${flags.cwd}/.agent/skills/tsnuke/SKILL.md`,
      contents: buildAgentsMarkdown({ rules: allRules() }),
      description: "agent skill (trigger spec + recipes + rule catalog)",
    },
    {
      path: `${flags.cwd}/.git/hooks/pre-push`,
      contents: PRE_PUSH_HOOK,
      description: "git pre-push hook (non-blocking score visibility)",
    },
  ];

  // TODO(P1): when --agent-hooks, emit Claude Code / Cursor native hook configs.
  if (flags.agentHooks) {
    writes.push({
      path: `${flags.cwd}/.claude/hooks/tsnuke.json`,
      contents: "{}\n",
      description: "native agent hook config (STUB)",
    });
  }

  return writes;
}

/**
 * Run `install`. Writes the agent skill always; writes the pre-push hook iff the
 * file is absent OR carries the tsnuke marker (idempotent re-install). When a
 * non-tsnuke pre-push hook already exists, REFUSES to clobber and prints a clear
 * one-line instruction. Always returns 0 (install never gates).
 */
export const runInstall = Effect.fn("Cli.install")(function* (
  flags: InstallFlags,
  stdout: (text: string) => Effect.Effect<void>,
) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const writes = planInstall(flags);

    for (const w of writes) {
      // Pre-push gets the existing-hook check; every other write is a simple
      // "create-if-needed" (SKILL.md is overwrite-on-re-install — it's our file).
      const isPrePush = w.path.endsWith(".git/hooks/pre-push");

      if (flags.dryRun) {
        if (isPrePush) {
          const existing = yield* readIfExists(fs, w.path);
          if (existing !== null && !isTsnukeOwnedHook(existing)) {
            yield* stdout(
              `[dry-run] would SKIP ${w.path} — existing non-tsnuke hook detected (would not clobber).\n`,
            );
            continue;
          }
        }
        yield* stdout(`[dry-run] would write ${w.path} — ${w.description}\n`);
        continue;
      }

      if (isPrePush) {
        const existing = yield* readIfExists(fs, w.path);
        if (existing !== null && !isTsnukeOwnedHook(existing)) {
          yield* stdout(
            `tsnuke: existing pre-push hook at ${w.path} — refusing to overwrite.\n` +
              `       To enable tsnuke's regression check, append this line to the hook:\n` +
              `       npx --no tsnuke --diff --score 2>&1 || true\n`,
          );
          continue;
        }
      }

      yield* fs.makeDirectory(path.dirname(w.path), { recursive: true });
      yield* fs.writeFileString(w.path, w.contents);
      yield* stdout(`wrote ${w.path} — ${w.description}\n`);
    }

    return 0 as const;
  });

/**
 * Read a file as utf-8 — returning `null` ONLY when the file is genuinely absent
 * (NotFound). Other errors (EACCES, EISDIR, EIO, …) propagate to a "treat as
 * existing-but-unreadable" branch: the caller {@link runInstall} then returns
 * the "refusing to overwrite" message and leaves the file untouched. This
 * narrowing is what the comment in the prior version CLAIMED but the
 * `orElseSucceed(null)` implementation did NOT — it silently collapsed every
 * read failure to "absent", and the next step OVERWROTE the file.
 */
const readIfExists = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<string | null> =>
  fs.readFileString(filePath, "utf8").pipe(
    Effect.catchTag("SystemError", (e) =>
      e.reason === "NotFound"
        ? Effect.succeed(null as string | null)
        // Any other system error: surface the file as a sentinel non-empty
        // string so the marker check fails → install refuses to clobber.
        : Effect.succeed("<unreadable>"),
    ),
    // Bad file path / encoding errors fall here too; same conservative answer.
    Effect.orElseSucceed(() => "<unreadable>" as string | null),
  );
