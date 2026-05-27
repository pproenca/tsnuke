/**
 * `@tsnuke/rules-registry-effect` — the GLOBAL rule registry.
 *
 * Aggregates all 95 transformed rules into the two registries the engine consumes:
 *   - {@link ruleRegistry}      — the 93 per-file rules (SYN/TYP/CFG): SYN 71 + TYP 18 +
 *     the 4 CFG strictness activation rules. The engine drives each once per source file
 *     via its `create(ctx)` visitor factory.
 *   - {@link graphRuleRegistry} — the 2 GRAPH rules (`no-import-cycles`,
 *     `no-unused-exports`). The engine drives each once over the whole `ModuleGraph` via
 *     its `analyze(ctx)` pass.
 *
 * This is the Effect-native replacement for the legacy codegen `rule-registry.generated.ts`
 * (assembled by `scripts/generate-rule-registry.mjs`). It is a hand-assembled aggregator:
 * it imports each per-category slice's exported rule array read-only and concatenates them
 * — it owns no rules of its own. See TRANSFORMATION_NOTES.md for the legacy → target map.
 *
 * Barrel hygiene: this slice exports ONLY the two aggregate registries (plus a small count
 * helper). It deliberately does NOT re-export the individual rules — a consumer that wants
 * one rule imports it from its owning slice (e.g. `enableStrict` from
 * `@tsnuke/rules-core-effect`). The `Rule` / `GraphRule` types likewise stay owned by
 * `@tsnuke/rules-core-effect`.
 */

export { ruleRegistry, graphRuleRegistry } from "./registry.js";

import { graphRuleRegistry, ruleRegistry } from "./registry.js";

/**
 * The total number of rules in the catalog: per-file (`ruleRegistry`) + GRAPH
 * (`graphRuleRegistry`). Currently 93 + 2 = 95. Computed (not hard-coded) so it tracks the
 * registries as slices grow; the exact 95 tally is the load-bearing invariant asserted in
 * `src/test/`.
 */
export const totalRuleCount: number =
  ruleRegistry.length + graphRuleRegistry.length;

// Self-barrel: `import { RulesRegistry } from "@tsnuke/rules-registry-effect"` resolves to
// this module's namespace (the self-barrel module shape). Additive — the named exports above
// (`ruleRegistry` / `graphRuleRegistry` / `totalRuleCount`) remain the canonical surface.
export * as RulesRegistry from "./index.js";
