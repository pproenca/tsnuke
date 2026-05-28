/**
 * Pure derivation of the "first move" an agent (or a human) should take on the report.
 *
 * The CTA in the human footer and the `nextAction` field in the agent JSON come from
 * the SAME function — so the headline an agent reads matches the line a human sees in
 * the terminal. Pure: diagnostics → a plain record.
 *
 * Priority (agent-leverage ordering, refined after the 2026-05-27 maddie-native session
 * where the agent overrode the original "highest-occurrence" pick because it pointed at
 * 161 boilerplate annotations while 2 real errors went unmentioned):
 *
 *   1. clean run                                        → `all-clear`
 *   2. ANY auto-fixable occurrence                      → `run-fix` (cheapest action)
 *      The summary names how many of those are errors so the agent knows the value
 *      of running `--fix` before reading the rest of the report.
 *   3. ANY error rule (manual)                          → `address-rule` on the error
 *      rule with the most occurrences. Errors lead severity-wise — the agent should
 *      not be steered at warnings while errors remain unaddressed.
 *   4. else                                             → `address-rule` on the warning
 *      with the most occurrences (the legacy default — kept as the fallback).
 *
 * Rationale (vs the prior simpler "auto-fix first; else highest-occurrence" rule): in
 * practice "highest-occurrence" almost always picks a high-volume cleanup rule (e.g.
 * `explicit-module-boundary-types`), drowning out a small number of real errors. The
 * severity-aware pick keeps step 2's cheap-action priority but inserts an "errors before
 * warnings" tier so the agent's `nextAction` is never wrong about what to start with.
 */
import type { Diagnostic, FixKind, Severity } from "@tsnuke/contracts-effect";

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
  /**
   * Severity of the focus rule when `kind === "address-rule"` — so an agent can see at a
   * glance whether `nextAction` points at a real error or a warning. Omitted otherwise.
   */
  readonly focusSeverity?: Severity;
}

const fixKindOf = (d: Diagnostic): FixKind => d.fix?.kind ?? "manual";

/** Count occurrences by fix kind across all diagnostics. */
export function summarizeFixes(diagnostics: readonly Diagnostic[]): FixSummary {
  const countOf = (kind: FixKind): number =>
    diagnostics.filter((d) => fixKindOf(d) === kind).length;
  return {
    autoFixable: countOf("auto-fix"),
    codemod: countOf("codemod"),
    manual: countOf("manual"),
  };
}

/**
 * Pick the focus rule, preferring ERRORS over warnings. Within each severity bucket
 * picks the rule with the most occurrences (ties broken alphabetically). Returns
 * `undefined` only on a completely empty input.
 */
function pickFocusRule(
  diagnostics: readonly Diagnostic[],
): { rule: string; severity: Severity } | undefined {
  const errorCounts = new Map<string, number>();
  const warningCounts = new Map<string, number>();
  for (const d of diagnostics) {
    const bucket = d.severity === "error" ? errorCounts : warningCounts;
    bucket.set(d.rule, (bucket.get(d.rule) ?? 0) + 1);
  }
  const topOf = (m: Map<string, number>): string | undefined => {
    const sorted = [...m.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return sorted[0]?.[0];
  };
  const e = topOf(errorCounts);
  if (e !== undefined) return { rule: e, severity: "error" };
  const w = topOf(warningCounts);
  if (w !== undefined) return { rule: w, severity: "warning" };
  return undefined;
}

/** Distinct auto-fixable rule ids in deterministic (alphabetical) order. */
function autoFixableRuleIds(diagnostics: readonly Diagnostic[]): readonly string[] {
  const rules = diagnostics
    .filter((d) => fixKindOf(d) === "auto-fix")
    .map((d) => d.rule);
  return [...new Set(rules)].sort((a, b) => a.localeCompare(b));
}

/** Count auto-fixable diagnostics whose severity is "error". */
function autoFixableErrors(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.filter(
    (d) => d.severity === "error" && fixKindOf(d) === "auto-fix",
  ).length;
}

/**
 * Derive the next-best-action for an agent. See module doc for the four-step priority.
 */
export function deriveNextAction(diagnostics: readonly Diagnostic[]): NextAction {
  if (diagnostics.length === 0) {
    return { kind: "all-clear", summary: "All clear — no issues found." };
  }
  const fixes = summarizeFixes(diagnostics);
  if (fixes.autoFixable > 0) {
    const rules = autoFixableRuleIds(diagnostics);
    const noun = fixes.autoFixable === 1 ? "issue" : "issues";
    const errs = autoFixableErrors(diagnostics);
    const errNote =
      errs > 0 ? ` (incl. ${errs} error${errs === 1 ? "" : "s"})` : "";
    return {
      kind: "run-fix",
      summary: `Run \`tsnuke --fix\` to auto-resolve ${fixes.autoFixable} ${noun}${errNote}.`,
      autoFixableRules: rules,
    };
  }
  const focus = pickFocusRule(diagnostics);
  if (focus === undefined) {
    return { kind: "all-clear", summary: "All clear — no issues found." };
  }
  const count = diagnostics.filter(
    (d) => d.rule === focus.rule && d.severity === focus.severity,
  ).length;
  const summary =
    focus.severity === "error"
      ? `Start with \`${focus.rule}\` — ${count} error${count === 1 ? "" : "s"} (errors lead over warnings).`
      : `Start with \`${focus.rule}\` — the rule with the most occurrences.`;
  return {
    kind: "address-rule",
    summary,
    focusRule: focus.rule,
    focusSeverity: focus.severity,
  };
}
