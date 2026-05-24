import type { Rule } from "./define-rule.js";
import type { Severity } from "./types.js";
import { ruleRegistry } from "./rule-registry.generated.js";

/** A preset: a read-only projection of the registry to an `id -> severity` map. */
export interface Preset {
  name: string;
  /** Map of rule id -> the severity that rule registers at under this preset. */
  ruleSeverities: Readonly<Record<string, Severity>>;
}

/**
 * Build a preset by selecting rules from the registry that pass `predicate`,
 * projecting each to its declared severity. Pure over the given registry.
 */
export function buildPreset(
  name: string,
  predicate: (rule: Rule) => boolean,
  registry: readonly Rule[] = ruleRegistry,
): Preset {
  const ruleSeverities: Record<string, Severity> = {};
  for (const rule of registry) {
    if (predicate(rule)) ruleSeverities[rule.id] = rule.severity;
  }
  return { name, ruleSeverities };
}

/**
 * `recommended`: every rule that is enabled by default
 * (i.e. not explicitly `defaultEnabled:false`). This is the baseline preset.
 */
export const recommended: Preset = buildPreset(
  "recommended",
  (rule) => rule.defaultEnabled !== false,
);

/** All presets, keyed by name. (More — strict/library/app/node — land with C15.) */
export const presets: Readonly<Record<string, Preset>> = {
  recommended,
};
