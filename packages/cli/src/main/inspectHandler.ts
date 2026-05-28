/**
 * The `inspect` handler — `runInspect`'s flow re-expressed as an Effect over an
 * injectable IO seam.
 *
 * Flow:
 *   1. map flags → `DiagnoseOptions`            (`toDiagnoseOptions`)
 *   2. `analyze()` (engine slice, monorepo-aware) (via the injected `analyze` seam)
 *   3. `--explain`/`--why` → `explain()` card   (offline; short-circuits, never gates)
 *   4. `--fix` → `applyFixesToFiles*` + a stderr summary line
 *   5. choose output: `--score` → score line; `--json` → `buildReport`(single project) +
 *      `JSON.stringify` (compact toggle); `--format agent` → `formatAgentReport` + JSON;
 *      else `renderPretty`
 *   6. resolve exit via `resolveExitCode({ diagnostics, failOn, scoreMode })` (RULE-030)
 *
 * INJECTABLE IO SEAM ({@link InspectIo}): `stdout`/`stderr` writers + the two genuinely-
 * effectful operations (`diagnose`, `applyFixes`) as injected callbacks, plus the rule
 * catalog for `--explain`. The handler touches no `process`, no disk — fully unit-testable.
 *
 * Pure formatting / exit logic is CONSUMED from the proven slices (format-effect,
 * build-report-effect, exit-code-effect) — never re-implemented here.
 */

import * as os from "node:os";
import { Effect } from "effect";
import type { Diagnostic, OnProgress, RuleMeta } from "@tsnuke/contracts-effect";
import type {
  DiagnoseOptions,
  DiagnoseResult,
  ScoreResult,
  WorkspaceResult,
} from "@tsnuke/engine-effect";
import type { ApplyFilesResult } from "@tsnuke/fix-applier-effect";
import {
  asRuleLookup,
  derivePartialReason,
  explain,
  formatAgentReport,
  renderPretty,
  renderScoreLine,
  renderWorkspacePretty,
  type WorkspaceProjectView,
  type WorkspaceView,
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
   * Analyze the target directory. This is the MONOREPO-aware boundary: a plain TS project
   * comes back as a 1-entry, `isWorkspace:false` WorkspaceResult; a workspace ROOT as N
   * entries with `isWorkspace:true`. Tests inject a canned result. May fail with the
   * engine's tagged discovery errors (→ exit 1 at the process edge).
   *
   * `options.onProgress` (if set) receives phase events as the run progresses; the
   * production seam wires this to a stderr renderer. Tests can omit it.
   */
  readonly analyze: (
    directory: string,
    options: DiagnoseOptions & { readonly onProgress?: OnProgress },
  ) => Effect.Effect<WorkspaceResult, unknown>;
  /**
   * Optional phase-level progress sink — surfaced by the handler so the renderer
   * can show "discovering project…" / "tier-2: TYP over 124 files…" lines while
   * the engine works. Default: undefined (tests don't need it).
   */
  readonly onProgress?: OnProgress;
  /**
   * Apply `--fix` edits over real files (fix-applier slice; CWE-59-safe, atomic).
   * Production wires `applyFixesToFilesNode(diagnostics, rootDir)`; tests inject a counter.
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
 * `deep === undefined` ⇒ omit (engine auto-decides, RULE-035); `--project a,b` narrows
 * `includePaths`.
 */
export function toDiagnoseOptions(flags: InspectFlags): DiagnoseOptions {
  const includePaths = flags.projects.length > 0 ? flags.projects : undefined;
  return {
    lint: flags.lint,
    deadCode: flags.deadCode,
    ...(flags.deep !== undefined ? { deep: flags.deep } : {}),
    verbose: flags.verbose,
    respectInlineDisables: flags.respectInlineDisables,
    ...(includePaths !== undefined ? { includePaths } : {}),
  };
}

/** Find the first diagnostic at a given `file:line` (column-agnostic). Pure. */
export function findDiagnosticAt(
  diagnostics: readonly Diagnostic[],
  file: string,
  line: number,
): Diagnostic | undefined {
  return diagnostics.find((d) => d.line === line && d.filePath.endsWith(file));
}

/**
 * Build the single-project JSON report (RULE-034 wire shape via the build-report slice).
 * The build-report slice owns the summary rollup + schema/ok; the CLI only assembles its
 * input and picks the mode label + indentation.
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

/** Project an engine-side `DiagnoseResult` onto the format slice's structural shape. */
const toProjectView = (p: DiagnoseResult): WorkspaceProjectView => ({
  rootDirectory: p.project.rootDirectory,
  score: p.score,
  scorePartial: p.scorePartial,
  diagnostics: p.diagnostics,
  elapsedMilliseconds: p.elapsedMilliseconds,
});

/** Project an engine-side `WorkspaceResult` onto the format slice's structural shape. */
const toWorkspaceView = (ws: WorkspaceResult): WorkspaceView => ({
  rootDirectory: ws.rootDirectory,
  projects: ws.projects.map(toProjectView),
  elapsedMilliseconds: ws.elapsedMilliseconds,
});

/**
 * Run `inspect` end to end and return the intended process exit code (`0 | 1`). Does NOT
 * exit the process — the process edge (`bin.ts`) sets `process.exitCode`.
 */
export const runInspect = Effect.fn("Cli.inspect")(function* (
  flags: InspectFlags,
  io: InspectIo,
  version: string,
  rulesChecked = 0,
) {
    // 2. analyze (the one genuinely-effectful + possibly-failing step). The seam is
    //    monorepo-aware: a plain project comes back as a 1-entry, `isWorkspace:false`
    //    WorkspaceResult; a workspace ROOT as N entries with `isWorkspace:true`.
    //    Progress streaming is suppressed for `--score` (already one line of output),
    //    `--json` (would corrupt the JSON stream), `--format agent` (same), and
    //    `--explain`/`--why` (engine result is discarded anyway).
    const suppressProgress =
      flags.score ||
      flags.json ||
      flags.format === "agent" ||
      flags.explain !== undefined ||
      flags.why !== undefined ||
      io.onProgress === undefined;
    const diagnoseOpts: DiagnoseOptions & { readonly onProgress?: OnProgress } = {
      ...toDiagnoseOptions(flags),
      ...(suppressProgress || io.onProgress === undefined ? {} : { onProgress: io.onProgress }),
    };
    const ws = yield* io.analyze(flags.directory, diagnoseOpts);
    const single = ws.isWorkspace ? undefined : ws.projects[0];
    const allDiagnostics = ws.projects.flatMap((p) => p.diagnostics);

    // 3. --explain / --why: offline, deterministic; short-circuits other output and
    //    never gates (always exit 0).
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
              ...(match.url !== undefined ? { url: match.url } : {}),
              occurrencesInRun: allDiagnostics.filter((d) => d.rule === match.rule).length,
            })
          : `No diagnostic at ${explainTarget.file}:${explainTarget.line}.`;
      yield* io.stdout(`${text}\n`);
      return 0;
    }

    // 4. --fix: apply auto-fix edits in place, PER PROJECT, then continue to output.
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

    // 5. choose output. The SINGLE-project branch composes the new doctor header /
    //    tier line / rule-grouped block / footer (via `renderPretty`). The WORKSPACE
    //    branch renders per-project rows + a workspace doctor header + CTA. The
    //    workspace min-score is rolled up ONCE here and reused across the ternary.
    const summary = single !== undefined ? null : workspaceSummaryScore(ws, version);
    const output =
      single !== undefined
        ? flags.score
          ? renderScoreLine(single.score, single.scorePartial, { color: flags.color })
          : flags.json
            ? buildJsonString(single, flags, version)
            : flags.format === "agent"
              ? JSON.stringify(
                  formatAgentReport(
                    single.diagnostics,
                    single.score,
                    single.project.rootDirectory,
                    {
                      elapsedMs: single.elapsedMilliseconds,
                      scorePartial: single.scorePartial,
                      partialReason: derivePartialReason(single.skippedCheckReasons),
                      ...(single.typecheckErrors !== undefined
                        ? {
                            typecheckErrors: single.typecheckErrors.map((e) => ({
                              ...e,
                              filePath: e.filePath.startsWith(`${single.project.rootDirectory}/`)
                                ? e.filePath.slice(single.project.rootDirectory.length + 1)
                                : e.filePath,
                            })),
                          }
                        : {}),
                    },
                  ),
                  null,
                  2,
                )
              : renderPretty(single.diagnostics, single.score, single.scorePartial, {
                  color: flags.color,
                  verbose: flags.verbose,
                  version,
                  elapsedMs: single.elapsedMilliseconds,
                  rulesChecked,
                  showScore: flags.showScore,
                  repoRoot: single.project.rootDirectory,
                  partialReason: derivePartialReason(single.skippedCheckReasons),
                })
        : flags.score
          ? renderScoreLine(summary, summary?.partial ?? false, { color: flags.color })
          : flags.json
            ? buildWorkspaceJsonString(ws, flags, version)
            : flags.format === "agent"
              ? (() => {
                  const firstPartial = ws.projects.find((p) => p.scorePartial);
                  const tcErrs = firstPartial?.typecheckErrors;
                  return JSON.stringify(
                    formatAgentReport(allDiagnostics, summary, ws.rootDirectory, {
                      elapsedMs: ws.elapsedMilliseconds,
                      scorePartial: summary?.partial ?? false,
                      // Workspace mode: per-project skip reasons can differ — derive from
                      // the first partial project so the agent gets a representative cause.
                      partialReason: derivePartialReason(firstPartial?.skippedCheckReasons),
                      ...(tcErrs !== undefined
                        ? {
                            typecheckErrors: tcErrs.map((e) => ({
                              ...e,
                              filePath: e.filePath.startsWith(`${ws.rootDirectory}/`)
                                ? e.filePath.slice(ws.rootDirectory.length + 1)
                                : e.filePath,
                            })),
                          }
                        : {}),
                    }),
                    null,
                    2,
                  );
                })()
              : renderWorkspacePretty(toWorkspaceView(ws), summary, {
                  color: flags.color,
                  verbose: flags.verbose,
                  version,
                  rulesChecked,
                  showScore: flags.showScore,
                  showAll: flags.all,
                  homeDir: os.homedir(),
                });
    yield* io.stdout(`${output}\n`);

    // 6. exit-code gate (RULE-030) over ALL diagnostics. `--score` never fails.
    return resolveExitCode({
      diagnostics: allDiagnostics,
      failOn: flags.failOn,
      scoreMode: flags.score,
    });
  });
