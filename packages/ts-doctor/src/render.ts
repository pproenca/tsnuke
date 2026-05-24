/**
 * Minimal pretty renderer for human terminal output: a score header followed by
 * diagnostics grouped by category. Deliberately small (not heavily tested) — the
 * machine-facing surfaces (`--json`, `--format agent`) are the contract-critical
 * ones; this is just a readable default.
 *
 * Pure: returns a string. The CLI edge writes it to stdout.
 */
import type { Diagnostic } from "@ts-doctor/rules";
import type { ScoreResult } from "@ts-doctor/core";

/** Render just the score line (used by `--score` mode and as the pretty header). */
export function renderScoreLine(score: ScoreResult | null, scorePartial: boolean): string {
  if (score === null) return "Score: n/a";
  const partial = scorePartial ? " (partial — type info unavailable, not comparable)" : "";
  return `Score: ${score.score}/100 — ${score.label}${partial}`;
}

/** Render one diagnostic as a single `file:line:col  severity  rule  message` line. */
function renderDiagnostic(d: Diagnostic): string {
  return `  ${d.filePath}:${d.line}:${d.column}  ${d.severity}  ${d.rule}  ${d.message}`;
}

/**
 * Render the full pretty report: score header (unless `showScore` is false) plus
 * diagnostics grouped by category, categories in alphabetical order.
 */
export function renderPretty(
  diagnostics: readonly Diagnostic[],
  score: ScoreResult | null,
  scorePartial: boolean,
  showScore = true,
): string {
  const lines: string[] = [];

  if (showScore) {
    lines.push(renderScoreLine(score, scorePartial));
    lines.push("");
  }

  if (diagnostics.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  const byCategory = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    let bucket = byCategory.get(d.category);
    if (bucket === undefined) {
      bucket = [];
      byCategory.set(d.category, bucket);
    }
    bucket.push(d);
  }

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  for (const category of categories) {
    lines.push(`${category}:`);
    const group = byCategory.get(category) ?? [];
    for (const d of group) lines.push(renderDiagnostic(d));
    lines.push("");
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;
  lines.push(`${errorCount} error(s), ${warningCount} warning(s).`);

  return lines.join("\n");
}
