/**
 * MCP tool handlers — PURE logic, decoupled from the MCP SDK wiring (`server.ts`).
 *
 * Each function maps validated args → a plain result. Keeping these SDK-free
 * makes them unit-testable and keeps the protocol adapter thin. The MCP server
 * exposes tsnuke to coding agents (the primary consumer, per the AI-native
 * design): diagnose a project, explain a rule, list the catalog.
 *
 * ── Effect-TS slice port ──────────────────────────────────────────────────────
 * Ported VERBATIM (behavior) from `legacy/.../packages/mcp/src/tools.ts`, rewired
 * onto the finished strangler-fig slices:
 *   - `diagnose` (legacy `@tsnuke/core`)  → `diagnoseNode` (`@tsnuke/engine-effect`),
 *     the prod runnable that provides `NodeContext` + bounds the Program `Scope`.
 *   - `formatAgentReport` / `explain` / `asRuleLookup` → `@tsnuke/format-effect`.
 *   - `ruleRegistry` / `graphRuleRegistry` (legacy `@tsnuke/rules`) →
 *     `@tsnuke/rules-registry-effect`. Each registry entry is a `Rule`/`GraphRule`,
 *     i.e. a `RuleMeta` SUPERSET, so `buildLookup` / the catalog projection read the
 *     same `id`/`category`/`tier`/`severity`/`recommendation`/`fixKind` fields as legacy.
 *   - `RuleMeta` is imported from `@tsnuke/contracts-effect` (the canonical de-vendored
 *     Schema type) instead of the legacy `@tsnuke/rules`.
 *
 * The output shapes/text are preserved BYTE-FOR-BYTE. `diagnoseTool` stays a `Promise`
 * (it runs the engine via `diagnoseNode`); `explainTool` / `listRulesTool` stay pure.
 */
import type { RuleMeta } from "@tsnuke/contracts-effect";
import { diagnoseNode } from "@tsnuke/engine-effect";
import {
  formatAgentReport,
  explain,
  asRuleLookup,
  type AgentReport,
} from "@tsnuke/format-effect";
import { ruleRegistry, graphRuleRegistry } from "@tsnuke/rules-registry-effect";

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

/** `tsnuke_diagnose` — lint + score a TypeScript project for an agent. */
export async function diagnoseTool(args: DiagnoseToolArgs): Promise<DiagnoseToolResult> {
  const result = await diagnoseNode(args.directory, {
    ...(args.deep !== undefined ? { deep: args.deep } : {}),
  });
  const report = formatAgentReport(
    result.diagnostics,
    result.score,
    result.project.rootDirectory,
    { elapsedMs: result.elapsedMilliseconds, scorePartial: result.scorePartial },
  );
  const score = result.score?.score ?? null;
  const label = result.score?.label ?? "n/a";
  const partial = result.scorePartial ? " (partial — type info unavailable)" : "";
  const headline =
    `Score ${score ?? "n/a"}/100${partial} — ${label}. ` +
    `${report.ruleCount} rule(s) fired across ${report.occurrenceCount} occurrence(s) ` +
    `in ${args.directory}.`;
  const summary = `${headline} Next: ${report.nextAction.summary}`;
  return { summary, report, scorePartial: result.scorePartial };
}

export interface ExplainToolArgs {
  rule: string;
}

/** `tsnuke_explain` — offline, deterministic explanation of a rule. */
export function explainTool(args: ExplainToolArgs): string {
  return explain(args.rule, buildLookup());
}

export interface RuleCatalogEntry {
  id: string;
  category: string;
  tier: RuleMeta["tier"];
  severity: RuleMeta["severity"];
}

/** `tsnuke_list_rules` — the full catalog, for rule discovery. */
export function listRulesTool(): RuleCatalogEntry[] {
  const all: RuleMeta[] = [...ruleRegistry, ...graphRuleRegistry];
  return all
    .map((r) => ({ id: r.id, category: r.category, tier: r.tier, severity: r.severity }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
