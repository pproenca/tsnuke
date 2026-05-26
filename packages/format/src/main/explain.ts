/**
 * `--explain` / `--why` — INTENTIONALLY OFFLINE & DETERMINISTIC.
 *
 * No model call, no network. The "AI-native" value is the *structured rule metadata*
 * an agent consumes, not an in-tool LLM round-trip. `explain` is a pure lookup +
 * formatter over the static rule registry: same rule id + same context → byte-identical
 * output. Shared by the CLI (`--explain`) and the MCP server (`tsnuke_explain`).
 *
 * The card is intentionally compact (one screen): header row, fix/url chip, help
 * paragraph, recommendation, and (when called with a concrete diagnostic) the
 * inferred type and a run-occurrence count.
 */
import type { Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";

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
  /** The diagnostic's `help` text (per-occurrence, may differ from `recommendation`). */
  help?: string;
  /** Inferred TypeScript type at the site, when the rule captured one. */
  inferredType?: string;
  /** Documentation URL for the rule (lives on the diagnostic, not the meta). */
  url?: string;
  /** How many times the rule fired in the current run. */
  occurrencesInRun?: number;
}

/**
 * Render an offline explanation card for `ruleId`. Deterministic; no model / network.
 *
 * Layout:
 *   <id>   [<tier> · <category> · <severity>]
 *   Fix: <fixKind> · <url>?
 *
 *   <help>?
 *
 *   Recommendation: <recommendation>?
 *
 *   Inferred type: <inferredType>?
 *   Occurrences in this run: <n>?
 */
export function explain(
  ruleId: string,
  registry: RuleLookup,
  context?: ExplainContext,
): string {
  const meta = registry.get(ruleId);
  if (meta === undefined) {
    return `Unknown rule "${ruleId}". No such rule in the tsnuke catalog.`;
  }

  const lines: string[] = [];

  lines.push(`${meta.id}   [${meta.tier} · ${meta.category} · ${meta.severity}]`);

  const fixKind = meta.fixKind ?? "manual";
  const chip = context?.url !== undefined ? `Fix: ${fixKind} · ${context.url}` : `Fix: ${fixKind}`;
  lines.push(chip);

  if (context?.help !== undefined && context.help.length > 0) {
    lines.push("");
    lines.push(context.help);
  }

  if (meta.recommendation !== undefined && meta.recommendation.length > 0) {
    lines.push("");
    lines.push(`Recommendation: ${meta.recommendation}`);
  }

  const tail: string[] = [];
  if (context?.inferredType !== undefined && context.inferredType.length > 0) {
    tail.push(`Inferred type: ${context.inferredType}`);
  }
  if (context?.occurrencesInRun !== undefined && context.occurrencesInRun > 0) {
    tail.push(`Occurrences in this run: ${context.occurrencesInRun}`);
  }
  if (tail.length > 0) {
    lines.push("");
    lines.push(...tail);
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
    ...(diagnostic.url !== undefined ? { url: diagnostic.url } : {}),
  };
  return explain(diagnostic.rule, registry, context);
}
