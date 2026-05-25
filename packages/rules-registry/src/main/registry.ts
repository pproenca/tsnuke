/**
 * The GLOBAL rule registry — the hand-assembled aggregator over every per-category rule
 * slice.
 *
 * Legacy builds this list by CODEGEN: `scripts/generate-rule-registry.mjs` scans every
 * `defineRule(`/`defineGraphRule(` call site under `rules/` and emits
 * `rule-registry.generated.ts` (a flat `ruleRegistry` of per-file rules + a separate
 * `graphRuleRegistry` of GRAPH rules). In the modernized strangler-fig world the catalog
 * is split across per-category slices, each exporting its own `ReadonlyArray<Rule>` (or
 * `ReadonlyArray<GraphRule>`). This module re-aggregates those slice arrays into the two
 * registries the engine consumes — the Effect-native replacement for the codegen output.
 *
 * It owns NO rules itself: every entry is imported read-only from its owning slice. The
 * `Rule` / `GraphRule` TYPES come from `@tsnuke/rules-core-effect` (the substrate),
 * which is the canonical home for the rule shapes; the data contracts they embed
 * (`Diagnostic` / `RuleMeta`) live transitively in `@tsnuke/contracts-effect`.
 *
 * Catalog tally (frozen invariant, asserted in `src/test/`):
 *   - `ruleRegistry`      = 86 per-file rules (SYN 64 + TYP 18 + CFG 4 strictness)
 *   - `graphRuleRegistry` =  2 GRAPH rules
 *   - combined            = 88, with ALL ids globally unique (no collision across the two
 *     registries — a duplicate id would double-count or shadow a rule).
 */

import type { GraphRule, Rule } from "@tsnuke/rules-core-effect";

// The 4 AST-free `strictness` CFG rules ship as rules-core's own `ruleRegistry` (the v1
// manual seam). Alias it so its role here is unambiguous.
import { ruleRegistry as strictnessRules } from "@tsnuke/rules-core-effect";

// The per-category SYN/TYP rule slices, each exporting its own `ReadonlyArray<Rule>`.
import { typePerformanceRules } from "@tsnuke/rules-type-performance-effect";
import { declarationApiRules } from "@tsnuke/rules-declaration-api-effect";
import { securityRules } from "@tsnuke/rules-security-effect";
import { namingIdiomsRules } from "@tsnuke/rules-naming-idioms-effect";
import { genericsRules } from "@tsnuke/rules-generics-effect";
import { typeAssertionsRules } from "@tsnuke/rules-type-assertions-effect";
import { asyncRules } from "@tsnuke/rules-async-effect";
import { errorHandlingRules } from "@tsnuke/rules-error-handling-effect";
import { typeSafetyRules } from "@tsnuke/rules-type-safety-effect";
import { exhaustivenessRules } from "@tsnuke/rules-exhaustiveness-effect";
import { moduleBoundariesRules } from "@tsnuke/rules-module-boundaries-effect";

// The GRAPH-tier slice — the only source of `graphRuleRegistry` entries.
import { graphRules } from "@tsnuke/rules-graph-effect";

/**
 * The per-file rule registry the engine drives once per source file: all SYN/TYP rules
 * plus the 4 CFG strictness activation rules. The strictness CFG rules come from
 * rules-core's own `ruleRegistry` (its v1 manual seam); the rest are the per-category
 * SYN/TYP slices. Contains NO GRAPH rules — those live in {@link graphRuleRegistry}.
 *
 * Total: 86 (CFG 4 + SYN 64 + TYP 18).
 */
export const ruleRegistry: ReadonlyArray<Rule> = [
  ...strictnessRules,
  ...typePerformanceRules,
  ...declarationApiRules,
  ...securityRules,
  ...namingIdiomsRules,
  ...genericsRules,
  ...typeAssertionsRules,
  ...asyncRules,
  ...errorHandlingRules,
  ...typeSafetyRules,
  ...exhaustivenessRules,
  ...moduleBoundariesRules,
];

/**
 * The GRAPH-tier rule registry the engine drives once over the whole `ModuleGraph`
 * (`no-import-cycles` RULE-015 + dead-code `no-unused-exports` RULE-025). Distinct from
 * {@link ruleRegistry}: these have the `analyze(graph)` shape, not a per-file `create`.
 *
 * Total: 2.
 */
export const graphRuleRegistry: ReadonlyArray<GraphRule> = [...graphRules];
