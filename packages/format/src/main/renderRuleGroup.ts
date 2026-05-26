/**
 * Render the per-category, per-rule block — one entry per `plugin/rule`, occurrences
 * listed beneath. Reuses the deduped projection from `formatAgentReport` so what the
 * agent sees in JSON and what a human sees in the terminal share their grouping.
 *
 *   <Category>  <N> issues
 *     ✗ <rule-id>  ×<n>  [<TIER> · <fixKind>]   <url>?
 *       <message> — <help>?
 *       src/a.ts:1:1
 *       src/b.ts:5:3
 *       (+3 more — use --verbose)
 *
 * `--verbose` lists every occurrence; otherwise the first 3 are shown and the rest
 * collapse to a count.
 */
import type { AgentCategoryGroup, AgentRuleEntry } from "./format-agent.js";
import { bold, dim, red, yellow } from "./theme.js";

const OCCURRENCE_LIMIT = 3;

export interface RuleGroupInput {
  readonly categories: readonly AgentCategoryGroup[];
  readonly verbose: boolean;
  readonly color: boolean;
}

function severityIcon(severity: AgentRuleEntry["severity"], color: boolean): string {
  return severity === "error" ? red(color, "✗") : yellow(color, "⚠");
}

function chip(entry: AgentRuleEntry, color: boolean): string {
  return dim(color, `[${entry.tier} · ${entry.fixKind}]`);
}

function renderOccurrenceList(entry: AgentRuleEntry, verbose: boolean, color: boolean): string[] {
  const limit = verbose ? entry.occurrences.length : OCCURRENCE_LIMIT;
  const shown = entry.occurrences.slice(0, limit);
  const lines = shown.map((o) => `      ${dim(color, `${o.filePath}:${o.line}:${o.column}`)}`);
  const hidden = entry.occurrences.length - shown.length;
  if (hidden > 0) {
    lines.push(`      ${dim(color, `(+${hidden} more — use --verbose)`)}`);
  }
  return lines;
}

function renderRule(entry: AgentRuleEntry, verbose: boolean, color: boolean): string[] {
  const icon = severityIcon(entry.severity, color);
  const ruleName = bold(color, entry.rule);
  const count = entry.occurrences.length > 1 ? `  ${dim(color, `×${entry.occurrences.length}`)}` : "";
  const url = entry.url !== undefined ? `   ${dim(color, entry.url)}` : "";
  const headline = `    ${icon} ${ruleName}${count}  ${chip(entry, color)}${url}`;

  const detail =
    entry.help && entry.help.length > 0 && entry.help !== entry.message
      ? `      ${entry.message} ${dim(color, `— ${entry.help}`)}`
      : `      ${entry.message}`;

  return [headline, detail, ...renderOccurrenceList(entry, verbose, color)];
}

function renderCategory(group: AgentCategoryGroup, verbose: boolean, color: boolean): string[] {
  const total = group.rules.reduce((acc, r) => acc + r.occurrences.length, 0);
  const noun = total === 1 ? "issue" : "issues";
  const header = `  ${bold(color, group.category)}  ${dim(color, `${total} ${noun}`)}`;
  const ruleBlocks = group.rules.flatMap((r) => [...renderRule(r, verbose, color), ""]);
  return [header, ...ruleBlocks];
}

/** Render the full rule-group block. Empty string when there are no categories. */
export function renderRuleGroup(input: RuleGroupInput): string {
  if (input.categories.length === 0) return "";
  return input.categories
    .flatMap((c) => renderCategory(c, input.verbose, input.color))
    .join("\n");
}
