/**
 * The `inspect` handler — `runInspect`'s flow (legacy `commands/inspect.ts:111-175`)
 * re-expressed as an Effect over an injectable IO seam.
 *
 * Flow (port of legacy, step-for-step):
 *   1. map flags → `DiagnoseOptions`            (`toDiagnoseOptions`)
 *   2. `analyze()` (engine slice, monorepo-aware) (via the injected `analyze` seam)
 *   3. `--explain`/`--why` → `explain()` text   (offline; short-circuits, never gates)
 *   4. `--fix` → `applyFixesToFiles*` + a stderr summary line
 *   5. choose output: `--score` → score line; `--json` → `buildReport`(single project)+
 *      `JSON.stringify` (compact toggle); `--format agent` → `formatAgentReport`+JSON;
 *      else `renderPretty`
 *   6. resolve exit via `resolveExitCode({ diagnostics, failOn, scoreMode })` (RULE-030)
 *
 * INJECTABLE IO SEAM ({@link InspectIo}): `stdout`/`stderr` writers + the two genuinely-
 * effectful operations (`diagnose`, `applyFixes`) as injected callbacks, plus the rule
 * catalog for `--explain`. This is the brief's "injectable Terminal/FileSystem seam":
 * the `@effect/cli` command (`inspectCommand.ts`) supplies the real seam (Terminal +
 * `diagnoseNode`/`applyFixesToFilesNode`); tests supply an in-memory one. The handler
 * itself touches no `process`, no disk — so it is fully unit-testable.
 *
 * Pure formatting / exit logic is CONSUMED from the proven slices (format-effect,
 * build-report-effect, exit-code-effect) — never re-implemented here.
 */

import { Effect } from "effect";
import type { Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";
import type {
  DiagnoseOptions,
  DiagnoseResult,
  ScoreResult,
  WorkspaceResult,
} from "@tsnuke/engine-effect";
import type { ApplyFilesResult } from "@tsnuke/fix-applier-effect";
import {
  asRuleLookup,
  explain,
  formatAgentReport,
  renderPretty,
  renderScoreLine,
} from "@tsnuke/format-effect";
import { buildReport } from "@tsnuke/build-report-effect";
import { resolveExitCode } from "@tsnuke/exit-code-effect";
import type { InspectFlags } from "./flags.js";

/**
 * The IO seam: everything `inspect` touches outside pure computation. The
 * `@effect/cli` command supplies a real (Node/Terminal-backed) one; tests supply an
 * in-memory one. All members are Effects so the seam composes with the handler fiber.
 */
export interface InspectIo {
  /** Write to stdout (no implicit newline; the handler appends `\n` like legacy). */
  readonly stdout: (text: string) => Effect.Effect<void>;
  /** Write to stderr (the `--fix` summary line). */
  readonly stderr: (text: string) => Effect.Effect<void>;
  /**
   * Analyze the target directory (RULE-018/036 etc. all live in the engine slice). This
   * is the MONOREPO-aware boundary: production wires `diagnoseWorkspaceNode`, which
   * returns a single-project {@link WorkspaceResult} for a plain TS project and a
   * multi-project one for a workspace ROOT. Tests inject a canned result. May fail with
   * the engine's tagged discovery errors (→ exit 1 at the process edge).
   */
  readonly analyze: (
    directory: string,
    options: DiagnoseOptions,
  ) => Effect.Effect<WorkspaceResult, unknown>;
  /**
   * Apply `--fix` edits over real files (fix-applier slice; CWE-59-safe, atomic).
   * Production wires `applyFixesToFilesNode(diagnostics, rootDir)`; tests inject a
   * counter. NEVER fails (the shell is total — every IO/security failure skips+counts).
   */
  readonly applyFixes: (
    diagnostics: readonly Diagnostic[],
    rootDir: string,
  ) => Effect.Effect<ApplyFilesResult>;
  /** The static rule catalog for `--explain`/`--why` (offline metadata lookup). */
  readonly ruleCatalog: Readonly<Record<string, RuleMeta>>;
}

/**
 * Map CLI flags onto the engine's `DiagnoseOptions` (only the bits the engine consumes).
 * Ported VERBATIM from legacy `inspect.ts:40-51`: `deep: undefined` means AUTO (omit it
 * so the engine decides, RULE-035); `--project a,b` narrows `includePaths`.
 */
export function toDiagnoseOptions(flags: InspectFlags): DiagnoseOptions {
  const includePaths = flags.projects.length > 0 ? flags.projects : undefined;
  return {
    lint: flags.lint,
    deadCode: flags.deadCode,
    // `deep === undefined` ⇒ omit ⇒ engine auto-decides (RULE-035).
    ...(flags.deep !== undefined ? { deep: flags.deep } : {}),
    verbose: flags.verbose,
    respectInlineDisables: flags.respectInlineDisables,
    ...(includePaths !== undefined ? { includePaths } : {}),
  };
}

/**
 * Find the first diagnostic at a given `file:line` (column-agnostic). Pure. Ported
 * VERBATIM from legacy `inspect.ts:178-184` (suffix match on `filePath`).
 */
export function findDiagnosticAt(
  diagnostics: readonly Diagnostic[],
  file: string,
  line: number,
): Diagnostic | undefined {
  return diagnostics.find((d) => d.line === line && d.filePath.endsWith(file));
}

/**
 * Build the single-project JSON report, then stringify it (RULE-034 wire shape via the
 * build-report slice). One `diagnose` result wrapped in a 1-project report (legacy
 * `buildJsonReport`, `inspect.ts:54-96`). The build-report slice owns the summary rollup +
 * schema/ok; the CLI only assembles its input and picks the mode label (RULE-033) +
 * indentation (`--json-compact`). Single-project output is byte-stable (the project
 * `directory` stays `flags.directory`, as legacy).
 */
export function buildJsonString(
  result: DiagnoseResult,
  flags: InspectFlags,
  version: string,
): string {
  const mode = flags.staged ? "staged" : flags.diff !== undefined ? "diff" : "full";
  const report = buildReport({
    version,
    directory: flags.directory,
    mode,
    diff: null,
    projects: [
      {
        directory: flags.directory,
        diagnostics: result.diagnostics,
        score: result.score?.score ?? null,
        scorePartial: result.scorePartial,
        skippedChecks: result.skippedChecks,
        elapsedMilliseconds: result.elapsedMilliseconds,
      },
    ],
    elapsedMilliseconds: result.elapsedMilliseconds,
    error: null,
  });
  return JSON.stringify(report, null, flags.jsonCompact ? 0 : 2);
}

/**
 * Build the MULTI-project (workspace) JSON report (BC-05). Each enumerated member becomes
 * a `projects[]` entry keyed by its OWN directory; the build-report slice rolls them up to
 * the min-score summary. Top-level `directory` is the workspace root.
 */
export function buildWorkspaceJsonString(
  ws: WorkspaceResult,
  flags: InspectFlags,
  version: string,
): string {
  const report = buildReport({
    version,
    directory: flags.directory,
    mode: "full",
    diff: null,
    projects: ws.projects.map((p) => ({
      directory: p.project.rootDirectory,
      diagnostics: p.diagnostics,
      score: p.score?.score ?? null,
      scorePartial: p.scorePartial,
      skippedChecks: p.skippedChecks,
      elapsedMilliseconds: p.elapsedMilliseconds,
    })),
    elapsedMilliseconds: ws.elapsedMilliseconds,
    error: null,
  });
  return JSON.stringify(report, null, flags.jsonCompact ? 0 : 2);
}

/** A member directory, shown relative to the workspace root (the root itself → "."). */
const relativeDir = (root: string, dir: string): string =>
  dir === root ? "." : dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir;

/**
 * The workspace summary: the BC-05 min-score across members (via the build-report rollup),
 * mapped back into the structural `ScoreResult` the format slice consumes. `null` score
 * when no member was scorable.
 */
function workspaceSummaryScore(ws: WorkspaceResult, version: string): ScoreResult | null {
  const summary = buildReport({
    version,
    directory: ws.rootDirectory,
    mode: "full",
    diff: null,
    projects: ws.projects.map((p) => ({
      directory: p.project.rootDirectory,
      diagnostics: p.diagnostics,
      score: p.score?.score ?? null,
      scorePartial: p.scorePartial,
      skippedChecks: p.skippedChecks,
      elapsedMilliseconds: p.elapsedMilliseconds,
    })),
    elapsedMilliseconds: ws.elapsedMilliseconds,
    error: null,
  }).summary;
  if (summary.score === null) return null;
  return {
    score: summary.score,
    label: summary.scoreLabel ?? "",
    partial: summary.scorePartial,
  };
}

/**
 * Render the pretty workspace report: a per-project section (its score header + grouped
 * diagnostics, via the proven single-project `renderPretty`) followed by a BC-05 summary
 * line (min score + aggregate error/warning counts across all members).
 */
export function renderWorkspacePretty(
  ws: WorkspaceResult,
  version: string,
  showScore: boolean,
): string {
  const lines: string[] = [];
  for (const p of ws.projects) {
    lines.push(`▸ ${relativeDir(ws.rootDirectory, p.project.rootDirectory)}`);
    lines.push(renderPretty(p.diagnostics, p.score, p.scorePartial, showScore));
    lines.push("");
  }
  const all = ws.projects.flatMap((p) => p.diagnostics);
  const errors = all.filter((d) => d.severity === "error").length;
  const summaryScore = workspaceSummaryScore(ws, version);
  const scoreText = showScore ? `${renderScoreLine(summaryScore, summaryScore?.partial ?? false)} · ` : "";
  lines.push(
    `Workspace: ${ws.projects.length} project(s) · ${scoreText}` +
      `${errors} error(s), ${all.length - errors} warning(s).`,
  );
  return lines.join("\n");
}

/**
 * Run `inspect` end to end and return the intended process exit code (`0 | 1`). Does NOT
 * exit the process — the process edge (`bin.ts`) sets `process.exitCode`. A faithful
 * port of legacy `runInspect` over the injected {@link InspectIo} seam.
 */
export const runInspect = Effect.fn("Cli.inspect")(function* (
  flags: InspectFlags,
  io: InspectIo,
  version: string,
) {
    // 2. analyze (the one genuinely-effectful + possibly-failing step). The seam is
    //    monorepo-aware: a plain project comes back as a 1-entry, `isWorkspace:false`
    //    WorkspaceResult; a workspace ROOT as N entries with `isWorkspace:true`.
    const ws = yield* io.analyze(flags.directory, toDiagnoseOptions(flags));
    const single = ws.isWorkspace ? undefined : ws.projects[0];
    // Diagnostics across every analyzed project (== the single project's, when not a ws).
    const allDiagnostics = ws.projects.flatMap((p) => p.diagnostics);

    // 3. --explain / --why: offline, deterministic; short-circuits other output and
    //    never gates (always exit 0). Ported from legacy `inspect.ts:121-140`. Searches
    //    across all members (a workspace has no single diagnostics list).
    const explainTarget = flags.explain ?? flags.why;
    if (explainTarget !== undefined) {
      const lookup = asRuleLookup(io.ruleCatalog);
      const match = findDiagnosticAt(allDiagnostics, explainTarget.file, explainTarget.line);
      const text =
        match !== undefined
          ? explain(match.rule, lookup, {
              ...(match.help !== undefined ? { help: match.help } : {}),
              ...(match.fix?.inferredType !== undefined
                ? { inferredType: match.fix.inferredType }
                : {}),
            })
          : `No diagnostic at ${explainTarget.file}:${explainTarget.line}.`;
      yield* io.stdout(`${text}\n`);
      return 0;
    }

    // 4. --fix: apply auto-fix edits in place (RULE-005/032 — the fix-applier slice),
    //    PER PROJECT (each member's edits resolve against its own root), then continue to
    //    output. For a single project this is one call with identical totals. Legacy
    //    `inspect.ts:143-150`.
    if (flags.fix) {
      const applieds = yield* Effect.forEach(
        ws.projects,
        (p) => io.applyFixes(p.diagnostics, p.project.rootDirectory),
        { concurrency: 1 },
      );
      const totals = applieds.reduce(
        (acc, a) => ({
          appliedCount: acc.appliedCount + a.appliedCount,
          filesChanged: acc.filesChanged + a.filesChanged,
          skippedCount: acc.skippedCount + a.skippedCount,
        }),
        { appliedCount: 0, filesChanged: 0, skippedCount: 0 },
      );
      yield* io.stderr(
        `Applied ${totals.appliedCount} fix(es) across ${totals.filesChanged} file(s)` +
          (totals.skippedCount > 0
            ? `; ${totals.skippedCount} skipped (conflicts).`
            : ".") +
          "\n",
      );
    }

    // 5. choose output. Legacy `inspect.ts:152-167`. The SINGLE-project branch is
    //    byte-identical to legacy (the engine's score result carries `label` already).
    //    The WORKSPACE branch renders a per-project breakdown + the BC-05 min summary.
    const output =
      single !== undefined
        ? flags.score
          ? renderScoreLine(single.score, single.scorePartial)
          : flags.json
            ? buildJsonString(single, flags, version)
            : flags.format === "agent"
              ? JSON.stringify(
                  formatAgentReport(single.diagnostics, single.score, single.project.rootDirectory),
                  null,
                  2,
                )
              : renderPretty(single.diagnostics, single.score, single.scorePartial, flags.showScore)
        : flags.score
          ? renderScoreLine(
              workspaceSummaryScore(ws, version),
              workspaceSummaryScore(ws, version)?.partial ?? false,
            )
          : flags.json
            ? buildWorkspaceJsonString(ws, flags, version)
            : flags.format === "agent"
              ? JSON.stringify(
                  formatAgentReport(
                    allDiagnostics,
                    workspaceSummaryScore(ws, version),
                    ws.rootDirectory,
                  ),
                  null,
                  2,
                )
              : renderWorkspacePretty(ws, version, flags.showScore);
    yield* io.stdout(`${output}\n`);

    // 6. exit-code gate (RULE-030, via the exit-code slice) over ALL diagnostics.
    //    `--score` never fails.
    return resolveExitCode({
      diagnostics: allDiagnostics,
      failOn: flags.failOn,
      scoreMode: flags.score,
    });
  });
