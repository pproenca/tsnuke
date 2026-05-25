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
 *
 * ── Effect-TS slice port ──────────────────────────────────────────────────────
 * Ported VERBATIM from `legacy/.../packages/core/src/format-agent.ts`. The two
 * deviations are pure plumbing, NOT behavior:
 *   1. `Diagnostic`/`FixKind`/`Tier` are imported from `@tsnuke/contracts-effect`
 *      (the canonical de-vendored Schema types) instead of the legacy `@tsnuke/rules`.
 *      The structural shapes are identical (proven by the contracts compat tests).
 *   2. The legacy `score` param was `Pick<ScoreResult, "score" | "label"> | null`;
 *      this slice does NOT depend on the score/engine slices, so the structural
 *      `{ score, label }` shape is inlined as a local type. RULE-032 sort logic is
 *      unchanged.
 */
import type { Diagnostic, FixKind, Tier } from "@tsnuke/contracts-effect";

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

/**
 * Structural input shape for the score summary `formatAgentReport` reads. The
 * legacy signature took `Pick<ScoreResult, "score" | "label">`; this slice is a
 * pure consumer of a structural input and does NOT depend on the score/engine
 * slices, so the two fields it reads are declared locally.
 */
export interface AgentScoreInput {
  score: number;
  label: string;
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
  score: AgentScoreInput | null,
  repoRoot = "",
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
    ruleCount: byRule.size,
    occurrenceCount: diagnostics.length,
    categories,
  };
}
