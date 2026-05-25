/**
 * Minimal pretty renderer for human terminal output: a score header followed by
 * diagnostics grouped by category. Deliberately small (not heavily tested) — the
 * machine-facing surfaces (`--json`, `--format agent`) are the contract-critical
 * ones; this is just a readable default.
 *
 * Pure: returns a string. The CLI edge writes it to stdout.
 *
 * ── Effect-TS slice port ──────────────────────────────────────────────────────
 * Ported VERBATIM from `legacy/.../packages/tsnuke/src/render.ts`. Deviations
 * are pure plumbing, NOT behavior:
 *   1. `Diagnostic` is imported from `@tsnuke/contracts-effect` (the canonical
 *      de-vendored Schema type) instead of the legacy `@tsnuke/rules`.
 *   2. The score input keeps the LEGACY structural `ScoreResult` shape
 *      `{ score; label; partial }` (legacy `core/types.ts`) — render is a PURE
 *      consumer of a structural input and does NOT depend on the engine/score
 *      slices. The modern score slice renamed the field to `band`; the CLI maps
 *      the engine's `band` → `label` when building this input. `renderScoreLine`
 *      reads only `.score` and `.label`; `partial` arrives via the separate
 *      `scorePartial` boolean param, exactly as in the legacy signature. The
 *      output strings are preserved byte-for-byte.
 */
import type { Diagnostic } from "@tsnuke/contracts-effect";

/**
 * The legacy `ScoreResult` structural shape (legacy `core/types.ts`). Render is a
 * pure consumer of this structural input; it does NOT depend on the engine/score
 * slices. The CLI maps the engine's score result into this shape (mapping the
 * modern `band` field → `label`).
 */
export interface RenderScoreResult {
  /** 0–100 integer. */
  score: number;
  /** Band label: "Great" / "Needs work" / "Critical". */
  label: string;
  /** True when Tier-2 was skipped — score is on a different scale (BC-03). */
  partial: boolean;
}

/** Render just the score line (used by `--score` mode and as the pretty header). */
export function renderScoreLine(
  score: RenderScoreResult | null,
  scorePartial: boolean,
): string {
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
  score: RenderScoreResult | null,
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
    const bucket = byCategory.get(d.category) ?? [];
    if (!byCategory.has(d.category)) byCategory.set(d.category, bucket);
    bucket.push(d);
  }

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  for (const category of categories) {
    lines.push(`${category}:`, ...(byCategory.get(category) ?? []).map(renderDiagnostic), "");
  }

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  lines.push(`${errors} error(s), ${diagnostics.length - errors} warning(s).`);

  return lines.join("\n");
}
