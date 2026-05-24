/**
 * MCP tool handlers — PURE logic, decoupled from the MCP SDK wiring (`server.ts`).
 *
 * Each function maps validated args → a plain result. Keeping these SDK-free
 * makes them unit-testable and keeps the protocol adapter thin. The MCP server
 * exposes ts-doctor to coding agents (the primary consumer, per the AI-native
 * design): diagnose a project, explain a rule, list the catalog.
 */
import {
  diagnose,
  formatAgentReport,
  explain,
  asRuleLookup,
  type AgentReport,
} from "@ts-doctor/core";
import { ruleRegistry, graphRuleRegistry } from "@ts-doctor/rules";
import type { RuleMeta } from "@ts-doctor/rules";

/** Build the rule-id → metadata lookup once from both registries. */
function buildLookup(): ReturnType<typeof asRuleLookup> {
  const all: RuleMeta[] = [...ruleRegistry, ...graphRuleRegistry];
  return asRuleLookup(Object.fromEntries(all.map((r): [string, RuleMeta] => [r.id, r])));
}

export interface DiagnoseToolArgs {
  directory: string;
  deep?: boolean;
}

export interface DiagnoseToolResult {
  /** One-line headline an agent can read at a glance. */
  summary: string;
  /** The agent-tuned, rule-deduplicated report (C14). */
  report: AgentReport;
  /** True when the type-aware tier was skipped (score on a partial scale). */
  scorePartial: boolean;
}

/** `ts_doctor_diagnose` — lint + score a TypeScript project for an agent. */
export async function diagnoseTool(args: DiagnoseToolArgs): Promise<DiagnoseToolResult> {
  const result = await diagnose(args.directory, {
    ...(args.deep !== undefined ? { deep: args.deep } : {}),
  });
  const report = formatAgentReport(
    result.diagnostics,
    result.score,
    result.project.rootDirectory,
  );
  const score = result.score?.score ?? null;
  const partial = result.scorePartial ? " (partial — type info unavailable)" : "";
  const summary =
    `Score ${score ?? "n/a"}/100${partial} — ` +
    `${report.ruleCount} rule(s) fired across ${report.occurrenceCount} occurrence(s) ` +
    `in ${args.directory}.`;
  return { summary, report, scorePartial: result.scorePartial };
}

export interface ExplainToolArgs {
  rule: string;
}

/** `ts_doctor_explain` — offline, deterministic explanation of a rule. */
export function explainTool(args: ExplainToolArgs): string {
  return explain(args.rule, buildLookup());
}

export interface RuleCatalogEntry {
  id: string;
  category: string;
  tier: RuleMeta["tier"];
  severity: RuleMeta["severity"];
}

/** `ts_doctor_list_rules` — the full catalog, for rule discovery. */
export function listRulesTool(): RuleCatalogEntry[] {
  const all: RuleMeta[] = [...ruleRegistry, ...graphRuleRegistry];
  return all
    .map((r) => ({ id: r.id, category: r.category, tier: r.tier, severity: r.severity }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
