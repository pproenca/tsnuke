/**
 * Pure derivation of the "first move" an agent (or a human) should take on the report.
 *
 * The CTA in the human footer and the `nextAction` field in the agent JSON come from
 * the SAME function — so the headline an agent reads matches the line a human sees in
 * the terminal. Pure: diagnostics → a plain record.
 */
import type { Diagnostic, FixKind } from "@tsnuke/contracts-effect";

/** Per-fix-kind occurrence counts. */
export interface FixSummary {
  readonly autoFixable: number;
  readonly codemod: number;
  readonly manual: number;
}

export type NextActionKind = "all-clear" | "run-fix" | "address-rule";

/** The structured "next action" the report headlines. */
export interface NextAction {
  readonly kind: NextActionKind;
  /** One-line human-readable summary (also used in the CLI footer + MCP headline). */
  readonly summary: string;
  /** Auto-fixable rule ids (deduped), present when `kind === "run-fix"`. */
  readonly autoFixableRules?: readonly string[];
  /** The single rule the agent should attack first when `kind === "address-rule"`. */
  readonly focusRule?: string;
}

const fixKindOf = (d: Diagnostic): FixKind => d.fix?.kind ?? "manual";

/** Count occurrences by fix kind across all diagnostics. */
export function summarizeFixes(diagnostics: readonly Diagnostic[]): FixSummary {
  return diagnostics.reduce<FixSummary>(
    (acc, d) => {
      const kind = fixKindOf(d);
      if (kind === "auto-fix") return { autoFixable: acc.autoFixable + 1, codemod: acc.codemod, manual: acc.manual };
      if (kind === "codemod") return { autoFixable: acc.autoFixable, codemod: acc.codemod + 1, manual: acc.manual };
      return { autoFixable: acc.autoFixable, codemod: acc.codemod, manual: acc.manual + 1 };
    },
    { autoFixable: 0, codemod: 0, manual: 0 },
  );
}

/** Choose the rule to focus on when nothing is auto-fixable: highest occurrence count, then alphabetical. */
function pickFocusRule(diagnostics: readonly Diagnostic[]): string | undefined {
  const counts = new Map<string, number>();
  for (const d of diagnostics) counts.set(d.rule, (counts.get(d.rule) ?? 0) + 1);
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return sorted[0]?.[0];
}

/** Distinct auto-fixable rule ids in deterministic (alphabetical) order. */
function autoFixableRuleIds(diagnostics: readonly Diagnostic[]): readonly string[] {
  const rules = diagnostics
    .filter((d) => fixKindOf(d) === "auto-fix")
    .map((d) => d.rule);
  return [...new Set(rules)].sort((a, b) => a.localeCompare(b));
}

/**
 * Derive the next-best-action for an agent. Clean → "all-clear"; any auto-fixable
 * occurrence → "run-fix"; else attack the rule with the most occurrences.
 */
export function deriveNextAction(diagnostics: readonly Diagnostic[]): NextAction {
  if (diagnostics.length === 0) {
    return { kind: "all-clear", summary: "All clear — no issues found." };
  }
  const fixes = summarizeFixes(diagnostics);
  if (fixes.autoFixable > 0) {
    const rules = autoFixableRuleIds(diagnostics);
    const noun = fixes.autoFixable === 1 ? "issue" : "issues";
    return {
      kind: "run-fix",
      summary: `Run \`tsnuke --fix\` to auto-resolve ${fixes.autoFixable} ${noun}.`,
      autoFixableRules: rules,
    };
  }
  const focus = pickFocusRule(diagnostics);
  if (focus === undefined) {
    return { kind: "all-clear", summary: "All clear — no issues found." };
  }
  return {
    kind: "address-rule",
    summary: `Start with \`${focus}\` — the rule with the most occurrences.`,
    focusRule: focus,
  };
}
