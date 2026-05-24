/**
 * `--explain` / `--why` — INTENTIONALLY OFFLINE & DETERMINISTIC (critic m3).
 *
 * No model call, no network. The "AI-native" value is the *structured rule
 * metadata* an agent consumes, not an in-tool LLM round-trip. `explain` is a
 * pure lookup + formatter over the static rule registry: same rule id →
 * byte-identical output. Shared by the CLI and the MCP server.
 */
import type { Diagnostic, RuleMeta } from "@ts-doctor/rules";

/** A lookup from rule id to its static metadata. */
export interface RuleLookup {
  get(ruleId: string): RuleMeta | undefined;
}

/** Adapt a plain `Record<id, RuleMeta>` into a {@link RuleLookup}. */
export function asRuleLookup(registry: Readonly<Record<string, RuleMeta>>): RuleLookup {
  return {
    get(ruleId: string): RuleMeta | undefined {
      return Object.prototype.hasOwnProperty.call(registry, ruleId)
        ? registry[ruleId]
        : undefined;
    },
  };
}

/** Optional concrete-diagnostic context, used to enrich the static explanation. */
export interface ExplainContext {
  help?: string;
  inferredType?: string;
}

/**
 * Render an offline explanation for `ruleId`. Deterministic; no model/network.
 */
export function explain(
  ruleId: string,
  registry: RuleLookup,
  context?: ExplainContext,
): string {
  const meta = registry.get(ruleId);
  if (meta === undefined) {
    return `Unknown rule "${ruleId}". No such rule in the ts-doctor catalog.`;
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

/** Convenience: explain the rule behind a concrete {@link Diagnostic}. Still offline. */
export function explainDiagnostic(diagnostic: Diagnostic, registry: RuleLookup): string {
  const context: ExplainContext = {
    ...(diagnostic.help !== undefined ? { help: diagnostic.help } : {}),
    ...(diagnostic.fix?.inferredType !== undefined
      ? { inferredType: diagnostic.fix.inferredType }
      : {}),
  };
  return explain(diagnostic.rule, registry, context);
}
