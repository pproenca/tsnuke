/**
 * Pretty terminal rendering — the human surface of `tsnuke`. Composes the small
 * `render*` pieces (header, tier line, rule groups, footer) into one block. Pure:
 * returns a string. The CLI edge writes it to stdout.
 *
 * The CLI decides colour (`isTTY && !NO_COLOR && !CI`), passes it in as a boolean.
 * When `color === false`, output is plain ASCII and snapshot-stable.
 *
 * `renderScoreLine` keeps a single-line shape for the `--score` mode. It gains
 * colour but stays text — pipelines that grep `Score: 80/100` still work.
 */
import type { Diagnostic } from "@tsnuke/contracts-effect";
import { formatAgentReport, type AgentReport } from "./format-agent.js";
import { renderHeader } from "./renderHeader.js";
import { renderTierLine } from "./renderTierLine.js";
import { renderFooter } from "./renderFooter.js";
import { renderRuleGroup } from "./renderRuleGroup.js";
import { colorForScore, dim, gray } from "./theme.js";

/**
 * The structural score input the pretty renderer consumes. The CLI maps the engine's
 * `band` → `label` when building this; render stays decoupled from the score slice.
 */
export interface RenderScoreResult {
  /** 0–100 integer. */
  score: number;
  /** Band label: "Great" / "Needs work" / "Critical". */
  label: string;
  /** True when Tier-2 was skipped — score is on a partial scale (BC-03). */
  partial: boolean;
}

/** Optional rendering knobs. Defaults preserve `tsnuke X.Y.Z` style output. */
export interface RenderPrettyOptions {
  readonly color?: boolean;
  readonly verbose?: boolean;
  readonly version?: string;
  readonly elapsedMs?: number;
  readonly rulesChecked?: number;
  readonly showScore?: boolean;
  /** Strip a repo-root prefix from occurrence paths (purely cosmetic). */
  readonly repoRoot?: string;
  /**
   * Machine-readable reason `partial` is true. When provided, the header renders a
   * specific caveat ("type-aware skipped: project doesn't type-check") instead of
   * the generic message. Derived by the caller from `DiagnoseResult.skippedCheckReasons`.
   */
  readonly partialReason?: "typecheck-failed" | "no-deep" | "memory" | "no-source-files" | null;
}

/**
 * Single-line score header — preserved for `--score` mode. When `color`, the score
 * number is tinted by band (green/yellow/red). Partial scores drop the named band
 * ("Great" / etc) and show a coverage caveat instead — the band is reserved for
 * fully-measured scores (RULE-018), so labels stay honest about what was checked.
 */
export function renderScoreLine(
  score: RenderScoreResult | null,
  scorePartial: boolean,
  options: { color?: boolean } = {},
): string {
  const color = options.color ?? false;
  if (score === null) return `Score: ${gray(color, "n/a")}`;
  const num = colorForScore(score.score, color, `${score.score}/100`);
  if (scorePartial) {
    return `Score: ${num} ${dim(color, "(partial — type-aware tier skipped, not comparable to a full score)")}`;
  }
  const lab = colorForScore(score.score, color, score.label);
  return `Score: ${num} — ${lab}`;
}

/**
 * Render the full pretty report: the doctor-style header, a one-line tier breakdown,
 * the rule-grouped diagnostics, and a footer with stats + CTA. Pure: returns string.
 */
export function renderPretty(
  diagnostics: readonly Diagnostic[],
  score: RenderScoreResult | null,
  scorePartial: boolean,
  options: RenderPrettyOptions = {},
): string {
  const color = options.color ?? false;
  const verbose = options.verbose ?? false;
  const showScore = options.showScore ?? true;
  const version = options.version;
  const elapsedMs = options.elapsedMs ?? 0;
  const rulesChecked = options.rulesChecked ?? 0;
  const repoRoot = options.repoRoot ?? "";

  const partialReason = options.partialReason ?? null;

  const report: AgentReport = formatAgentReport(
    diagnostics,
    score === null ? null : { score: score.score, label: score.label },
    repoRoot,
    { elapsedMs, scorePartial, partialReason },
  );

  const lines: string[] = [];

  if (showScore) {
    lines.push(
      renderHeader({
        score: score?.score ?? null,
        label: score?.label ?? null,
        partial: scorePartial,
        partialReason,
        ...(version !== undefined ? { tagline: `tsnuke · ${version}` } : {}),
        color,
      }),
    );
    lines.push("");
  }

  const tierLine = renderTierLine(report.tierBreakdown, color);
  if (tierLine.length > 0) {
    lines.push(tierLine);
    lines.push("");
  }

  const block = renderRuleGroup({ categories: report.categories, verbose, color });
  if (block.length > 0) {
    lines.push(block);
  }

  lines.push(
    renderFooter({
      diagnostics,
      fixSummary: report.fixSummary,
      nextAction: report.nextAction,
      rulesChecked,
      elapsedMs,
      color,
    }),
  );

  return lines.join("\n");
}
