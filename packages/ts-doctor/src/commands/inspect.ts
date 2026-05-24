/**
 * The `inspect` command (the CLI default) — orchestration only.
 *
 * Flow: parse flags → validate mode combos → call core `diagnose()` →
 * (if `--explain`/`--why`) render the offline explanation → otherwise choose an
 * output renderer (pretty | `--json` JsonReportV1 | `--format agent`) → compute
 * the exit code via the exit-code gate.
 *
 * Tier-2 is stubbed in core for v1; the CLI just consumes whatever `diagnose`
 * returns. All IO (stdout, exit) is funneled through an injected {@link InspectIo}
 * so this stays unit-testable; `cli.ts` supplies the real process-backed one.
 */
import { diagnose } from "@ts-doctor/core";
import type {
  DiagnoseResult,
  JsonReportV1,
  TsDoctorConfig,
} from "@ts-doctor/core";
import { ruleRegistry } from "@ts-doctor/rules";
import type { Diagnostic, RuleMeta } from "@ts-doctor/rules";

import { parseInspectFlags, validateModeFlags } from "../flags.js";
import type { InspectFlags } from "../flags.js";
import { resolveExitCode } from "../exit-code.js";
import { formatAgentReport } from "../format-agent.js";
import { renderPretty, renderScoreLine } from "../render.js";
import { asRuleLookup, explain } from "../explain.js";
import { applyFixesToFiles } from "../fix-applier.js";
import type { FileIo } from "../fix-applier.js";

/** IO seam: everything `inspect` touches outside pure computation. */
export interface InspectIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** File reader/writer for `--fix` application. */
  files: FileIo;
}

/** Map CLI flags onto core's `DiagnoseOptions` (only the bits core consumes). */
function toDiagnoseOptions(flags: InspectFlags): Parameters<typeof diagnose>[1] {
  const includePaths = flags.projects.length > 0 ? flags.projects : undefined;
  return {
    lint: flags.lint,
    deadCode: flags.deadCode,
    // `deep: undefined` means auto (core decides from typecheck:ok).
    ...(flags.deep !== undefined ? { deep: flags.deep } : {}),
    verbose: flags.verbose,
    respectInlineDisables: flags.respectInlineDisables,
    ...(includePaths !== undefined ? { includePaths } : {}),
  };
}

/** Build the versioned JSON report (BC-23) from a diagnose result. */
export function buildJsonReport(
  result: DiagnoseResult,
  flags: InspectFlags,
  version: string,
): JsonReportV1 {
  const errorCount = result.diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = result.diagnostics.length - errorCount;
  const affectedFiles = new Set(result.diagnostics.map((d) => d.filePath));
  const mode = flags.staged ? "staged" : flags.diff !== undefined ? "diff" : "full";

  return {
    schemaVersion: 1,
    version,
    ok: true,
    directory: flags.directory,
    mode,
    diff: null,
    projects: [
      {
        directory: flags.directory,
        project: result.project,
        diagnostics: result.diagnostics,
        score: result.score?.score ?? null,
        scorePartial: result.scorePartial,
        skippedChecks: result.skippedChecks,
        skippedCheckReasons: result.skippedCheckReasons ?? {},
        elapsedMilliseconds: result.elapsedMilliseconds,
      },
    ],
    diagnostics: result.diagnostics,
    summary: {
      errorCount,
      warningCount,
      affectedFileCount: affectedFiles.size,
      totalDiagnosticCount: result.diagnostics.length,
      score: result.score?.score ?? null,
      scoreLabel: result.score?.label ?? null,
      scorePartial: result.scorePartial,
    },
    elapsedMilliseconds: result.elapsedMilliseconds,
    error: null,
  };
}

/** Options carried in from the CLI entry (e.g. the package version string). */
export interface InspectRunOptions {
  argv: readonly string[];
  io: InspectIo;
  version: string;
  /** Optional already-loaded config (lenient loading happens in core; P1). */
  config?: TsDoctorConfig;
}

/**
 * Run `inspect` end to end and return the intended process exit code (0|1).
 * Does not call `process.exit`; the caller sets `process.exitCode`.
 */
export async function runInspect(options: InspectRunOptions): Promise<0 | 1> {
  const { argv, io, version } = options;

  // 1. parse + validate flag combinations (throws FlagError on bad combos).
  const flags = parseInspectFlags(argv);
  validateModeFlags(flags);

  // 2. analyze.
  const result: DiagnoseResult = await diagnose(flags.directory, toDiagnoseOptions(flags));

  // 3. --explain / --why: offline, deterministic; short-circuits other output.
  const explainTarget = flags.explain ?? flags.why;
  if (explainTarget !== undefined) {
    const lookup = asRuleLookup(
      Object.fromEntries(ruleRegistry.map((r): [string, RuleMeta] => [r.id, r])),
    );
    const match = findDiagnosticAt(result.diagnostics, explainTarget.file, explainTarget.line);
    const text =
      match !== undefined
        ? explain(match.rule, lookup, {
            ...(match.help !== undefined ? { help: match.help } : {}),
            ...(match.fix?.inferredType !== undefined
              ? { inferredType: match.fix.inferredType }
              : {}),
          })
        : `No diagnostic at ${explainTarget.file}:${explainTarget.line}.`;
    io.stdout(`${text}\n`);
    // Explain is informational — never gates.
    return 0;
  }

  // 4. --fix: apply auto-fix edits in place (BC-14), then continue to output.
  if (flags.fix) {
    const applied = applyFixesToFiles(result.diagnostics, io.files);
    io.stderr(
      `Applied ${applied.appliedCount} fix(es) across ${applied.filesChanged} file(s)` +
        (applied.skippedCount > 0 ? `; ${applied.skippedCount} skipped (conflicts).` : ".") +
        "\n",
    );
  }

  // 5. choose output.
  if (flags.score) {
    io.stdout(`${renderScoreLine(result.score, result.scorePartial)}\n`);
  } else if (flags.json) {
    const report = buildJsonReport(result, flags, version);
    io.stdout(`${JSON.stringify(report, null, flags.jsonCompact ? 0 : 2)}\n`);
  } else if (flags.format === "agent") {
    const report = formatAgentReport(
      result.diagnostics,
      result.score,
      result.project.rootDirectory,
    );
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    io.stdout(`${renderPretty(result.diagnostics, result.score, result.scorePartial, flags.showScore)}\n`);
  }

  // 6. exit-code gate (BC-21). `--score` never fails.
  return resolveExitCode({
    diagnostics: result.diagnostics,
    failOn: flags.failOn,
    scoreMode: flags.score,
  });
}

/** Find the first diagnostic at a given `file:line` (column-agnostic). Pure. */
export function findDiagnosticAt(
  diagnostics: readonly Diagnostic[],
  file: string,
  line: number,
): Diagnostic | undefined {
  return diagnostics.find((d) => d.line === line && d.filePath.endsWith(file));
}
