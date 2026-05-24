/**
 * `ts-doctor install` (C18) — STUB.
 *
 * Writes an agent skill (`SKILL.md`-style) so a coding agent knows when and how
 * to run ts-doctor, and (stub) installs a non-blocking git pre-push hook. The
 * real install mechanics (hook wiring, agent-hook formats for Claude Code /
 * Cursor) are P1; this is a clear, side-effect-isolated stub with TODOs.
 *
 * The skill *content* is pure (see {@link buildSkillMarkdown}); all filesystem
 * writes go through an injected {@link InstallIo} so the planning logic is
 * testable without touching disk.
 */

/** Flags for `install` (AI_NATIVE_SPEC.md §3.1). */
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

/** Parse `install` argv into {@link InstallFlags}. Pure. */
export function parseInstallFlags(argv: readonly string[], cwd: string): InstallFlags {
  const flags: InstallFlags = { cwd, yes: false, dryRun: false, agentHooks: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-y":
      case "--yes":
        flags.yes = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--agent-hooks":
        flags.agentHooks = true;
        break;
      case "--cwd": {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.cwd = next;
          i++;
        }
        break;
      }
      default:
        // install takes no positionals; ignore unknowns leniently for the stub.
        break;
    }
  }
  return flags;
}

/** A planned file write (so dry-run can describe it without performing it). */
export interface PlannedWrite {
  path: string;
  contents: string;
  description: string;
}

/**
 * Build the agent skill markdown. Pure + deterministic so it can be snapshotted.
 * Mirrors the SKILL.md trigger-spec + command-recipe shape from C18.
 */
export function buildSkillMarkdown(): string {
  return [
    "---",
    "name: ts-doctor",
    "description: >-",
    "  Run a TypeScript health check before finishing a change. Surfaces type-safety,",
    "  async, module-boundary, and strictness issues with machine-applicable fixes.",
    "triggers:",
    "  - after editing one or more .ts/.tsx files",
    "  - before opening a PR or pushing",
    "  - when asked to 'check types' or 'audit the TypeScript'",
    "---",
    "",
    "# ts-doctor",
    "",
    "Run ts-doctor in agent mode for a deduplicated, fix-sorted report:",
    "",
    "```sh",
    "npx ts-doctor --format agent",
    "```",
    "",
    "Regression-check only what changed (diff against the base branch):",
    "",
    "```sh",
    "npx ts-doctor --diff",
    "```",
    "",
    "Apply the safe auto-fixes, then re-scan and loop until the score stops improving:",
    "",
    "```sh",
    "npx ts-doctor --fix --format agent",
    "```",
    "",
    "Notes:",
    "- The score is local and deterministic; compare only same-scale scores",
    "  (a `scorePartial` run is NOT comparable to a full run).",
    "- Apply `auto-fix` edits first (cheapest), then `codemod`, then `manual`.",
    "",
  ].join("\n");
}

/** Compute the set of writes `install` would perform (no IO). Pure/testable. */
export function planInstall(flags: InstallFlags): PlannedWrite[] {
  const writes: PlannedWrite[] = [
    {
      path: `${flags.cwd}/.agent/skills/ts-doctor/SKILL.md`,
      contents: buildSkillMarkdown(),
      description: "agent skill (trigger spec + command recipe)",
    },
  ];

  // TODO(P1): real git hook installation. The hook should run
  // `npx ts-doctor --diff --fail-on error` non-blockingly (warn, don't block)
  // on pre-push, and respect an existing hook chain instead of clobbering it.
  writes.push({
    path: `${flags.cwd}/.git/hooks/pre-push`,
    contents: "#!/bin/sh\n# TODO(P1): non-blocking ts-doctor pre-push check\nexit 0\n",
    description: "git pre-push hook (STUB — non-blocking)",
  });

  // TODO(P1): when --agent-hooks, emit Claude Code / Cursor native hook configs.
  if (flags.agentHooks) {
    writes.push({
      path: `${flags.cwd}/.claude/hooks/ts-doctor.json`,
      contents: "{}\n",
      description: "native agent hook config (STUB)",
    });
  }

  return writes;
}

/** Filesystem seam for `install`. */
export interface InstallIo {
  stdout(text: string): void;
  writeFile(path: string, contents: string): void;
}

/**
 * Run `install`. In `--dry-run` it only describes the planned writes. Returns 0
 * (install never gates). STUB: hook wiring is a TODO; the skill write is real.
 */
export function runInstall(flags: InstallFlags, io: InstallIo): 0 {
  const writes = planInstall(flags);
  for (const w of writes) {
    if (flags.dryRun) {
      io.stdout(`[dry-run] would write ${w.path} — ${w.description}\n`);
      continue;
    }
    io.writeFile(w.path, w.contents);
    io.stdout(`wrote ${w.path} — ${w.description}\n`);
  }
  return 0;
}
