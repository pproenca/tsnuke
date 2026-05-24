/**
 * Agent-tuned output (C14) — the projection coding agents consume.
 *
 * Raw per-occurrence diagnostics are noisy and token-heavy; this projection is
 * built for an agent loop:
 *   - rule-DEDUPLICATED: one entry per `plugin/rule`, with an `occurrences[]`
 *     list (breadth-not-depth, matches the scoring model).
 *   - SORTED by tier (SYN→TYP→GRAPH→CFG) then fixKind (auto-fix first).
 *   - GROUPED by category; file paths made repo-relative.
 *   - deterministic ordering throughout.
 *
 * Pure: diagnostics + score → a plain JSON-serializable object. Shared by the
 * CLI (`--format agent`) and the MCP server.
 */
import type { Diagnostic, FixKind, Tier } from "@ts-doctor/rules";
import type { ScoreResult } from "./types.js";

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

/** The full agent report payload. */
export interface AgentReport {
  score: number | null;
  scoreLabel: string | null;
  ruleCount: number;
  occurrenceCount: number;
  categories: AgentCategoryGroup[];
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

/**
 * Build the agent report. `repoRoot` (default `""`) is stripped from file paths
 * to make them repo-relative; pass the discovered project root.
 */
export function formatAgentReport(
  diagnostics: readonly Diagnostic[],
  score: Pick<ScoreResult, "score" | "label"> | null,
  repoRoot = "",
): AgentReport {
  const byRule = new Map<string, AgentRuleEntry>();
  let occurrenceCount = 0;

  for (const d of diagnostics) {
    occurrenceCount++;
    const key = `${d.plugin}/${d.rule}`;
    let entry = byRule.get(key);
    if (entry === undefined) {
      entry = {
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
      byRule.set(key, entry);
    }
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
    let bucket = byCategory.get(category);
    if (bucket === undefined) {
      bucket = [];
      byCategory.set(category, bucket);
    }
    bucket.push(entry);
  }

  const categories: AgentCategoryGroup[] = [...byCategory.entries()]
    .map(([category, rules]) => ({ category, rules }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    score: score?.score ?? null,
    scoreLabel: score?.label ?? null,
    ruleCount: byRule.size,
    occurrenceCount,
    categories,
  };
}
