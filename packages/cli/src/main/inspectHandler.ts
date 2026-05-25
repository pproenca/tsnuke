/**
 * The `inspect` handler — `runInspect`'s flow (legacy `commands/inspect.ts:111-175`)
 * re-expressed as an Effect over an injectable IO seam.
 *
 * Flow (port of legacy, step-for-step):
 *   1. map flags → `DiagnoseOptions`            (`toDiagnoseOptions`)
 *   2. `diagnose()` (engine slice)              (via the injected `diagnose` seam)
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
import type { Diagnostic, RuleMeta } from "@ts-doctor/contracts-effect";
import type {
  DiagnoseOptions,
  DiagnoseResult,
} from "@ts-doctor/engine-effect";
import type { ApplyFilesResult } from "@ts-doctor/fix-applier-effect";
import {
  asRuleLookup,
  explain,
  formatAgentReport,
  renderPretty,
  renderScoreLine,
} from "@ts-doctor/format-effect";
import { buildReport } from "@ts-doctor/build-report-effect";
import { resolveExitCode } from "@ts-doctor/exit-code-effect";
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
   * Run the engine's single-project `diagnose` (RULE-018/036 etc. all live in the
   * engine slice). Production wires `diagnoseNode`; tests inject a canned result. May
   * fail with the engine's tagged discovery errors (→ exit 1 at the process edge).
   */
  readonly diagnose: (
    directory: string,
    options: DiagnoseOptions,
  ) => Effect.Effect<DiagnoseResult, unknown>;
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
 * build-report slice). v1 is SINGLE-PROJECT — one `diagnose` result wrapped in a
 * 1-project report (legacy `buildJsonReport`, `inspect.ts:54-96`). The build-report
 * slice owns the summary rollup + schema/ok; the CLI only assembles its input and picks
 * the mode label (RULE-033) + indentation (`--json-compact`).
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
 * Run `inspect` end to end and return the intended process exit code (`0 | 1`). Does NOT
 * exit the process — the process edge (`bin.ts`) sets `process.exitCode`. A faithful
 * port of legacy `runInspect` over the injected {@link InspectIo} seam.
 */
export const runInspect = Effect.fn("Cli.inspect")(function* (
  flags: InspectFlags,
  io: InspectIo,
  version: string,
) {
    // 2. analyze (the one genuinely-effectful + possibly-failing step).
    const result = yield* io.diagnose(flags.directory, toDiagnoseOptions(flags));

    // 3. --explain / --why: offline, deterministic; short-circuits other output and
    //    never gates (always exit 0). Ported from legacy `inspect.ts:121-140`.
    const explainTarget = flags.explain ?? flags.why;
    if (explainTarget !== undefined) {
      const lookup = asRuleLookup(io.ruleCatalog);
      const match = findDiagnosticAt(
        result.diagnostics,
        explainTarget.file,
        explainTarget.line,
      );
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
    //    then continue to output. Legacy `inspect.ts:143-150`.
    if (flags.fix) {
      const applied = yield* io.applyFixes(
        result.diagnostics,
        result.project.rootDirectory,
      );
      yield* io.stderr(
        `Applied ${applied.appliedCount} fix(es) across ${applied.filesChanged} file(s)` +
          (applied.skippedCount > 0
            ? `; ${applied.skippedCount} skipped (conflicts).`
            : ".") +
          "\n",
      );
    }

    // 5. choose output. Legacy `inspect.ts:152-167`. The engine's score result carries
    //    `label` already (it maps the score slice's `band` → `label`), so the format
    //    slice's structural `{ score, label, partial }` input is satisfied directly.
    const output = flags.score
      ? renderScoreLine(result.score, result.scorePartial)
      : flags.json
        ? buildJsonString(result, flags, version)
        : flags.format === "agent"
          ? JSON.stringify(
              formatAgentReport(result.diagnostics, result.score, result.project.rootDirectory),
              null,
              2,
            )
          : renderPretty(result.diagnostics, result.score, result.scorePartial, flags.showScore);
    yield* io.stdout(`${output}\n`);

    // 6. exit-code gate (RULE-030, via the exit-code slice). `--score` never fails.
    return resolveExitCode({
      diagnostics: result.diagnostics,
      failOn: flags.failOn,
      scoreMode: flags.score,
    });
  });
