/**
 * FROZEN copies of the three legacy formatter functions, vendored here as the
 * equivalence ORACLE. Each function below is a byte-for-byte copy of the legacy
 * implementation as of the port:
 *   - `legacy/.../packages/core/src/format-agent.ts`
 *   - `legacy/.../packages/tsnuke/src/render.ts`
 *   - `legacy/.../packages/core/src/explain.ts`
 *
 * The ONLY change vs the legacy source is dropping the `@tsnuke/rules` /
 * `./types.js` imports in favor of local structural type aliases — so this file is
 * self-contained and depends on nothing. The equivalence tests assert that the
 * ported `src/main/*` functions produce output that deep-equals / string-equals
 * these frozen oracles over crafted inputs. This is the behavioral-equivalence proof.
 *
 * DO NOT "improve" these. They must stay frozen at the legacy behavior.
 */

// ── Local structural type aliases (mirror the legacy @tsnuke/rules types) ──
type Severity = "error" | "warning";
type Tier = "SYN" | "TYP" | "GRAPH" | "CFG";
type FixKind = "auto-fix" | "codemod" | "manual";

interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}
interface Fix {
  kind: FixKind;
  edits: readonly TextEdit[];
  inferredType?: string;
}
export interface FrozenDiagnostic {
  filePath: string;
  plugin: string;
  rule: string;
  severity: Severity;
  message: string;
  help: string;
  url?: string;
  line: number;
  column: number;
  category: string;
  tier: Tier;
  fix?: Fix;
  suppressionHint?: string;
}
export interface FrozenRuleMeta {
  id: string;
  severity: Severity;
  category: string;
  tier: Tier;
  requires?: readonly string[];
  disabledBy?: readonly string[];
  tags?: readonly string[];
  defaultEnabled?: boolean;
  fixKind?: FixKind;
  message?: string;
  recommendation?: string;
}
interface FrozenScoreResult {
  score: number;
  label: string;
  partial: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
// format-agent.ts (frozen)
// ════════════════════════════════════════════════════════════════════════════

export interface FrozenAgentOccurrence {
  filePath: string;
  line: number;
  column: number;
}
export interface FrozenAgentRuleEntry {
  rule: string;
  plugin: string;
  severity: Severity;
  tier: Tier;
  fixKind: FixKind;
  message: string;
  help: string;
  url?: string;
  occurrences: FrozenAgentOccurrence[];
}
export interface FrozenAgentCategoryGroup {
  category: string;
  rules: FrozenAgentRuleEntry[];
}
export interface FrozenAgentReport {
  score: number | null;
  scoreLabel: string | null;
  ruleCount: number;
  occurrenceCount: number;
  categories: FrozenAgentCategoryGroup[];
}

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

function toRepoRelative(filePath: string, repoRoot: string): string {
  if (repoRoot.length === 0) return filePath;
  const root = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
  return filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
}

export function frozenFormatAgentReport(
  diagnostics: readonly FrozenDiagnostic[],
  score: Pick<FrozenScoreResult, "score" | "label"> | null,
  repoRoot = "",
): FrozenAgentReport {
  const byRule = new Map<string, FrozenAgentRuleEntry>();
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

  const byCategory = new Map<string, FrozenAgentRuleEntry[]>();
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

  const categories: FrozenAgentCategoryGroup[] = [...byCategory.entries()]
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

// ════════════════════════════════════════════════════════════════════════════
// render.ts (frozen)
// ════════════════════════════════════════════════════════════════════════════

export function frozenRenderScoreLine(
  score: FrozenScoreResult | null,
  scorePartial: boolean,
): string {
  if (score === null) return "Score: n/a";
  const partial = scorePartial ? " (partial — type info unavailable, not comparable)" : "";
  return `Score: ${score.score}/100 — ${score.label}${partial}`;
}

function frozenRenderDiagnostic(d: FrozenDiagnostic): string {
  return `  ${d.filePath}:${d.line}:${d.column}  ${d.severity}  ${d.rule}  ${d.message}`;
}

export function frozenRenderPretty(
  diagnostics: readonly FrozenDiagnostic[],
  score: FrozenScoreResult | null,
  scorePartial: boolean,
  showScore = true,
): string {
  const lines: string[] = [];

  if (showScore) {
    lines.push(frozenRenderScoreLine(score, scorePartial));
    lines.push("");
  }

  if (diagnostics.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  const byCategory = new Map<string, FrozenDiagnostic[]>();
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
    for (const d of group) lines.push(frozenRenderDiagnostic(d));
    lines.push("");
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;
  lines.push(`${errorCount} error(s), ${warningCount} warning(s).`);

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// explain.ts (frozen)
// ════════════════════════════════════════════════════════════════════════════

export interface FrozenRuleLookup {
  get(ruleId: string): FrozenRuleMeta | undefined;
}
export interface FrozenExplainContext {
  help?: string;
  inferredType?: string;
}

export function frozenAsRuleLookup(
  registry: Readonly<Record<string, FrozenRuleMeta>>,
): FrozenRuleLookup {
  return {
    get(ruleId: string): FrozenRuleMeta | undefined {
      return Object.prototype.hasOwnProperty.call(registry, ruleId)
        ? registry[ruleId]
        : undefined;
    },
  };
}

export function frozenExplain(
  ruleId: string,
  registry: FrozenRuleLookup,
  context?: FrozenExplainContext,
): string {
  const meta = registry.get(ruleId);
  if (meta === undefined) {
    return `Unknown rule "${ruleId}". No such rule in the tsnuke catalog.`;
  }

  const lines: string[] = [];
  lines.push(`${meta.id}  [${meta.tier}] (${meta.category}, ${meta.severity})`);

  if (context?.help !== undefined && context.help.length > 0) {
    lines.push("");
    lines.push(context.help);
  }
  if (meta.recommendation !== undefined && meta.recommendation.length > 0) {
    lines.push("");
    lines.push(`Recommendation: ${meta.recommendation}`);
  }
  if (context?.inferredType !== undefined && context.inferredType.length > 0) {
    lines.push("");
    lines.push(`Inferred type: ${context.inferredType}`);
  }
  if (meta.fixKind !== undefined) {
    lines.push("");
    lines.push(`Fix kind: ${meta.fixKind}`);
  }

  return lines.join("\n");
}

export function frozenExplainDiagnostic(
  diagnostic: FrozenDiagnostic,
  registry: FrozenRuleLookup,
): string {
  const context: FrozenExplainContext = {
    ...(diagnostic.help !== undefined ? { help: diagnostic.help } : {}),
    ...(diagnostic.fix?.inferredType !== undefined
      ? { inferredType: diagnostic.fix.inferredType }
      : {}),
  };
  return frozenExplain(diagnostic.rule, registry, context);
}
