/**
 * Agent-tuned output (C14) — the projection coding agents consume.
 *
 * Raw per-occurrence diagnostics are noisy and token-heavy; this projection is
 * built for an agent loop:
 *   - rule-DEDUPLICATED: one entry per `plugin/rule`, with an `occurrences[]`
 *     list (breadth-not-depth, matches the scoring model).
 *   - SORTED by tier (SYN→TYP→GRAPH→CFG) then fixKind (auto-fix first).
 *   - GROUPED by category; file paths made repo-relative.
 *   - HEADLINE fields the agent would otherwise have to recompute: `fixSummary`,
 *     `tierBreakdown`, `nextAction`. All additive — existing consumers ignore them.
 *
 * Pure: diagnostics + score + meta → a plain JSON-serializable object. Shared by the
 * CLI (`--format agent`) and the MCP server.
 */
import type { Diagnostic, FixKind, Tier } from "@tsnuke/contracts-effect";
import { deriveNextAction, summarizeFixes, type FixSummary, type NextAction } from "./nextAction.js";

/** One occurrence of a rule firing. */
export interface AgentOccurrence {
  filePath: string;
  line: number;
  column: number;
}

/** One deduplicated rule entry within a category group. */
export interface AgentRuleEntry {
  rule: string;
  plugin: string;
  severity: Diagnostic["severity"];
  tier: Tier;
  fixKind: FixKind;
  message: string;
  help: string;
  url?: string;
  occurrences: AgentOccurrence[];
}

/** Diagnostics grouped under one category. */
export interface AgentCategoryGroup {
  category: string;
  rules: AgentRuleEntry[];
}

/** Per-tier counts: rules that fired in that tier + total occurrences. */
export interface TierStat {
  readonly rules: number;
  readonly occurrences: number;
}

/** Tier × counts across all four tiers (zeros included so the shape is stable). */
export interface TierBreakdown {
  readonly SYN: TierStat;
  readonly TYP: TierStat;
  readonly GRAPH: TierStat;
  readonly CFG: TierStat;
}

/** The full agent report payload. */
export interface AgentReport {
  /** 0–100 score, or null when unscored. */
  score: number | null;
  /** "Great" / "Needs work" / "Critical" / null. */
  scoreLabel: string | null;
  /** True when Tier-2 was skipped — score is on a partial scale. */
  scorePartial: boolean;
  /** Distinct rules that fired. */
  ruleCount: number;
  /** Total occurrences across all rules. */
  occurrenceCount: number;
  /** Wall-clock duration of the analysis (ms). 0 when not provided. */
  elapsedMs: number;
  /** Per-fix-kind occurrence counts (cheapest action available at a glance). */
  fixSummary: FixSummary;
  /** Per-tier rule + occurrence counts. */
  tierBreakdown: TierBreakdown;
  /** The first move an agent should take on this report. */
  nextAction: NextAction;
  /** Diagnostics grouped by category, then by tier + fix-kind. */
  categories: AgentCategoryGroup[];
}

/**
 * Structural input shape for the score summary `formatAgentReport` reads. Kept as a
 * local type so this slice stays decoupled from the score/engine slices.
 */
export interface AgentScoreInput {
  score: number;
  label: string;
}

/** Optional run-level metadata threaded in by the engine. */
export interface AgentReportMeta {
  /** Wall-clock analysis time in milliseconds. */
  elapsedMs?: number;
  /** True when the type-aware tier was skipped (BC-03). */
  scorePartial?: boolean;
}

/** Tier sort order: cheap/syntactic first, config last. */
function tierOrder(tier: Tier): number {
  switch (tier) {
    case "SYN":
      return 0;
    case "TYP":
      return 1;
    case "GRAPH":
      return 2;
    case "CFG":
      return 3;
    default: {
      const _never: never = tier;
      return _never;
    }
  }
}

/** FixKind sort order: auto-fix first (cheapest agent action), manual last. */
function fixKindOrder(kind: FixKind): number {
  switch (kind) {
    case "auto-fix":
      return 0;
    case "codemod":
      return 1;
    case "manual":
      return 2;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** Make a path repo-relative by stripping a leading `repoRoot` prefix + separator. */
function toRepoRelative(filePath: string, repoRoot: string): string {
  if (repoRoot.length === 0) return filePath;
  const root = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
  return filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
}

/** Build a per-tier breakdown: rule count + occurrence count per tier. */
export function buildTierBreakdown(diagnostics: readonly Diagnostic[]): TierBreakdown {
  const stat = (tier: Tier): TierStat => {
    const matches = diagnostics.filter((d) => d.tier === tier);
    return {
      rules: new Set(matches.map((d) => `${d.plugin}/${d.rule}`)).size,
      occurrences: matches.length,
    };
  };
  return {
    SYN: stat("SYN"),
    TYP: stat("TYP"),
    GRAPH: stat("GRAPH"),
    CFG: stat("CFG"),
  };
}

/**
 * Build the agent report. `repoRoot` (default `""`) is stripped from file paths
 * to make them repo-relative; pass the discovered project root. `meta` carries
 * optional run-level fields (timing + partial-score flag).
 */
export function formatAgentReport(
  diagnostics: readonly Diagnostic[],
  score: AgentScoreInput | null,
  repoRoot = "",
  meta: AgentReportMeta = {},
): AgentReport {
  const byRule = new Map<string, AgentRuleEntry>();

  for (const d of diagnostics) {
    const key = `${d.plugin}/${d.rule}`;
    const existing = byRule.get(key);
    const entry = existing ?? {
      rule: d.rule,
      plugin: d.plugin,
      severity: d.severity,
      tier: d.tier,
      fixKind: d.fix?.kind ?? "manual",
      message: d.message,
      help: d.help,
      ...(d.url !== undefined ? { url: d.url } : {}),
      occurrences: [],
    };
    if (existing === undefined) byRule.set(key, entry);
    entry.occurrences.push({
      filePath: toRepoRelative(d.filePath, repoRoot),
      line: d.line,
      column: d.column,
    });
  }

  for (const entry of byRule.values()) {
    entry.occurrences.sort(
      (a, b) =>
        a.filePath.localeCompare(b.filePath) || a.line - b.line || a.column - b.column,
    );
  }

  const sortedEntries = [...byRule.values()].sort(
    (a, b) =>
      tierOrder(a.tier) - tierOrder(b.tier) ||
      fixKindOrder(a.fixKind) - fixKindOrder(b.fixKind) ||
      a.rule.localeCompare(b.rule),
  );

  const byCategory = new Map<string, AgentRuleEntry[]>();
  const ruleCategory = new Map<string, string>();
  for (const d of diagnostics) ruleCategory.set(`${d.plugin}/${d.rule}`, d.category);

  for (const entry of sortedEntries) {
    const category = ruleCategory.get(`${entry.plugin}/${entry.rule}`) ?? "";
    const bucket = byCategory.get(category) ?? [];
    if (!byCategory.has(category)) byCategory.set(category, bucket);
    bucket.push(entry);
  }

  const categories: AgentCategoryGroup[] = [...byCategory.entries()]
    .map(([category, rules]) => ({ category, rules }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    score: score?.score ?? null,
    scoreLabel: score?.label ?? null,
    scorePartial: meta.scorePartial ?? false,
    ruleCount: byRule.size,
    occurrenceCount: diagnostics.length,
    elapsedMs: meta.elapsedMs ?? 0,
    fixSummary: summarizeFixes(diagnostics),
    tierBreakdown: buildTierBreakdown(diagnostics),
    nextAction: deriveNextAction(diagnostics),
    categories,
  };
}
