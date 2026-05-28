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

/**
 * Machine-readable reason the score is partial — set when `scorePartial: true`.
 * `null` when full-tier ran. The vocabulary mirrors the engine's `SKIP_REASON_*`
 * sentinels so an agent can branch on it without parsing free-form text.
 */
export type PartialReason = "typecheck-failed" | "no-deep" | "memory" | "no-source-files";

/**
 * Explicit score-formula breakdown — lets an agent compute deltas across runs
 * without rederiving the math from rule lists. Mirrors react-doctor's reporting
 * (`100 − w_e × |err rules| − w_w × |warn rules|`).
 */
export interface ScoreBreakdown {
  /** Base score before penalties (frozen at 100). */
  readonly base: number;
  /** Error-rule penalty: `count × weight = total`. */
  readonly errorPenalty: { readonly count: number; readonly weight: number; readonly total: number };
  /** Warning-rule penalty: `count × weight = total`. */
  readonly warningPenalty: { readonly count: number; readonly weight: number; readonly total: number };
}

/**
 * One TypeScript pre-emit diagnostic surfaced to the agent so it has concrete files to
 * fix in order to unlock Tier-2 (the type-aware tier). Populated only when
 * `partialReason === "typecheck-failed"`; truncated to the first N (see {@link
 * TYPECHECK_ERRORS_LIMIT}) to keep the JSON token-cheap.
 */
export interface TypecheckError {
  /** Repo-relative file path (same projection as occurrences). */
  readonly filePath: string;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
  /** Human-readable message (TS diagnostic `messageText`, flattened). */
  readonly message: string;
  /** TypeScript diagnostic code (e.g. 2304 for "Cannot find name"). */
  readonly code: number;
}

/** Maximum typecheck errors embedded in the agent report. Keeps the payload small. */
export const TYPECHECK_ERRORS_LIMIT = 10;

/** The full agent report payload. */
export interface AgentReport {
  /**
   * Standing prompt-engineering preamble: short, agent-tuned guidance the consumer should
   * follow when acting on this report. Ports the react-doctor pattern (hypotheses, not
   * verdicts; confidence labels; no suppression without evidence) into the JSON so the
   * guidance survives MCP/tool-result transport intact. Stable across runs.
   */
  guidance: readonly string[];
  /** 0–100 score, or null when unscored. */
  score: number | null;
  /**
   * Band label ("Great" / "Needs work" / "Critical") — `null` when `scorePartial: true`
   * OR `score === null`. Labels carry an implicit confidence claim about coverage and
   * are reserved for fully-measured scores; on a partial score (TYP skipped) the band
   * is not earned and is omitted so an agent can't read "Great" off a result that
   * didn't run all checks. Use `partialReason` + `tierBreakdown` to render coverage.
   */
  scoreLabel: string | null;
  /** True when Tier-2 (TYP) was skipped — score is on a partial scale. */
  scorePartial: boolean;
  /**
   * Machine-readable reason for `scorePartial: true`; `null` when full-tier ran. The
   * vocabulary is stable: `"typecheck-failed"` / `"no-deep"` / `"memory"` /
   * `"no-source-files"`. Lets an agent branch on the reason rather than parse text.
   */
  partialReason: PartialReason | null;
  /**
   * Score formula breakdown — `base − errorPenalty.total − warningPenalty.total` = the
   * raw score before rounding/clamping. Always present (set even when score is null,
   * with zero counts). Agents can subtract two breakdowns across runs to see which
   * rules changed the score.
   */
  scoreBreakdown: ScoreBreakdown;
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
  /**
   * Top-N TypeScript pre-emit errors. Populated ONLY when
   * `partialReason === "typecheck-failed"` — the project doesn't compile, so the
   * type-aware tier was skipped (BC-03). These are the concrete files the agent
   * should fix to unlock Tier-2; without them an agent has no actionable lead and
   * tends to chase the score by adding annotations elsewhere.
   *
   * Empty array when full-tier ran or the cause isn't typecheck failure.
   */
  typecheckErrors: readonly TypecheckError[];
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
  /** Reason `scorePartial` is true; `null` / omitted when full-tier ran. */
  partialReason?: PartialReason | null;
  /**
   * Top-N TypeScript pre-emit errors carried in from the engine when the project failed
   * to type-check. Surfaced in the agent report so an agent has concrete files to fix to
   * unlock Tier-2 — without them, `partialReason: "typecheck-failed"` is unactionable.
   * The engine truncates the list; this slice just relays it.
   */
  typecheckErrors?: readonly TypecheckError[];
}

/**
 * Default guidance preamble — react-doctor's "Agent guidance" block, adapted for tsnuke.
 * Targets the specific failure modes seen in production (the 2026-05-27 maddie-native
 * session): score-chasing on a partial scale, agent ignoring `nextAction` because it
 * pointed at boilerplate, agent inventing flags to unlock Tier-2, agent applying
 * mechanical fixes without reading the surrounding code. Each line targets one of those.
 */
export const DEFAULT_AGENT_GUIDANCE: readonly string[] = [
  "Treat tsnuke diagnostics as starting hypotheses. Read the file before confirming or suppressing each finding.",
  "Assign a confidence (high/medium/low) per rule before acting; never suppress without code-level evidence.",
  "When `scorePartial: true`, the score is on a degraded scale and labels are withheld — fix `partialReason` before chasing the number.",
  "When `partialReason: \"typecheck-failed\"`, fix the items in `typecheckErrors[]` first — they block the type-aware tier from running.",
  "Follow `nextAction`: errors lead over warnings; `--fix` lands cheap wins; high-occurrence cleanups come last.",
  "Many slop-tagged rules (`ts-idiom`) flag REMOVING boilerplate (redundant `typeof`/`instanceof`, push-loops, `JSON.parse(JSON.stringify(...))`). Don't paper over them with new annotations.",
  "Don't refactor to gain score points. Score is a coarse signal — focus on real bugs and unsafe patterns.",
  "Use `tsnuke --explain <file>:<line>` to see the rationale and the suggested fix for any diagnostic.",
  "Investigate root causes for security-, async-, and type-flow rules (`no-floating-promises`, `no-unsafe-*`, `no-misused-promises`) before mass-editing.",
  "Split unrelated, broad, or behavior-changing work into separate PRs. Stop and ask if a fix requires an API or architecture decision.",
];

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
 * Map the engine's free-form skip-reason strings to the stable `PartialReason`
 * vocabulary. Returns `null` when no TYP rules were skipped, or when the reason
 * doesn't match a known sentinel. The engine carries the verbatim reason strings
 * from `engine-plan-effect` (`SKIP_REASON_NO_TYPECHECK`, `SKIP_REASON_NO_DEEP`,
 * `SKIP_REASON_MEMORY`); this function classifies them so agents can branch on a
 * single discriminator instead of substring-matching prose that may shift.
 */
export function derivePartialReason(
  skippedCheckReasons: Record<string, string> | undefined,
): PartialReason | null {
  if (skippedCheckReasons === undefined) return null;
  const reasons = Object.values(skippedCheckReasons);
  if (reasons.length === 0) return null;
  const first = reasons[0] ?? "";
  if (first.includes("does not type-check")) return "typecheck-failed";
  if (first.includes("--no-deep")) return "no-deep";
  if (first.includes("memory ceiling")) return "memory";
  if (first.includes("no source files")) return "no-source-files";
  return null;
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
  const ruleCategory = new Map<string, string>(
    diagnostics.map((d) => [`${d.plugin}/${d.rule}`, d.category]),
  );

  for (const entry of sortedEntries) {
    const category = ruleCategory.get(`${entry.plugin}/${entry.rule}`) ?? "";
    const bucket = byCategory.get(category) ?? [];
    if (!byCategory.has(category)) byCategory.set(category, bucket);
    bucket.push(entry);
  }

  const categories: AgentCategoryGroup[] = [...byCategory.entries()]
    .map(([category, rules]) => ({ category, rules }))
    .sort((a, b) => a.category.localeCompare(b.category));

  // Count distinct error / warning rules — same `plugin/rule` key the score uses
  // (RULE-001 breadth-not-depth). Built locally so this slice stays decoupled
  // from `score-effect`.
  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const d of diagnostics) {
    const k = `${d.plugin}/${d.rule}`;
    (d.severity === "error" ? errorRules : warningRules).add(k);
  }
  const ERROR_WEIGHT = 1.5;
  const WARNING_WEIGHT = 0.75;
  const scoreBreakdown: ScoreBreakdown = {
    base: 100,
    errorPenalty: {
      count: errorRules.size,
      weight: ERROR_WEIGHT,
      total: errorRules.size * ERROR_WEIGHT,
    },
    warningPenalty: {
      count: warningRules.size,
      weight: WARNING_WEIGHT,
      total: warningRules.size * WARNING_WEIGHT,
    },
  };

  const scorePartial = meta.scorePartial ?? false;
  const partialReason = scorePartial ? meta.partialReason ?? null : null;
  // Only surface typecheck errors when the cause IS a typecheck failure — emitting them
  // on (say) `--no-deep` would be misleading (deep was off; nothing to fix). Bound the
  // list defensively in case the engine sent more than the limit.
  const typecheckErrors: readonly TypecheckError[] =
    partialReason === "typecheck-failed"
      ? (meta.typecheckErrors ?? []).slice(0, TYPECHECK_ERRORS_LIMIT)
      : [];

  return {
    guidance: DEFAULT_AGENT_GUIDANCE,
    score: score?.score ?? null,
    // Drop the band label on partial scores — labels are reserved for fully-measured
    // results. The agent already gets `scorePartial`, `partialReason`, and the score
    // formula breakdown; a "Great" label on a partial score is what confused agents
    // in production (the maddie-native 2026-05-27 session).
    scoreLabel: scorePartial ? null : score?.label ?? null,
    scorePartial,
    partialReason,
    scoreBreakdown,
    ruleCount: byRule.size,
    occurrenceCount: diagnostics.length,
    elapsedMs: meta.elapsedMs ?? 0,
    fixSummary: summarizeFixes(diagnostics),
    tierBreakdown: buildTierBreakdown(diagnostics),
    nextAction: deriveNextAction(diagnostics),
    typecheckErrors,
    categories,
  };
}
