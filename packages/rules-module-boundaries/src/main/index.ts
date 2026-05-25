/**
 * `@tsnuke/rules-module-boundaries-effect` — the `module-boundaries` SYN rule category.
 *
 * Three pure AST predicates that plug into the `@tsnuke/rules-core-effect` substrate
 * (`defineRule` + the per-file `SyntaxKind → visitor` shape); the engine drives them via
 * the SAME walk/dispatch as `runRule`:
 *   - {@link noDeepRelativeImport} (RULE-011) — import/export whose specifier has >= 4
 *     LEADING `..` segments (INCLUSIVE boundary — distinct from the budget rules' `>`).
 *   - {@link noDefaultExport} — `export default <expr>` or a decl with `export`+`default`.
 *   - {@link publicApiMustBeExplicit} — wildcard re-export `export * from "..."`.
 *
 * The substrate (`defineRule`/`runRule`/`Rule`/`RuleContext`) is imported from
 * `@tsnuke/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`) live in
 * `@tsnuke/contracts-effect`. This slice does NOT re-export either's symbols (barrel
 * hygiene — it publishes only what it owns: the three rules + the category registry).
 *
 * DEFERRED: the category's fourth rule, `no-import-cycles` (tier GRAPH), is NOT migrated
 * here — it analyzes the cross-file module graph, which needs `core/src/module-graph.ts`
 * + a GRAPH driver that land in a later batch. See TRANSFORMATION_NOTES.md §4.
 */

import type { Rule } from "@tsnuke/rules-core-effect";

import { rule as noDeepRelativeImport } from "./no-deep-relative-import.js";
import { rule as noDefaultExport } from "./no-default-export.js";
import { rule as publicApiMustBeExplicit } from "./public-api-must-be-explicit.js";

// The three SYN rules, exported by stable name.
export { noDeepRelativeImport, noDefaultExport, publicApiMustBeExplicit };

/**
 * The `module-boundaries` category registry (the 3 SYN rules — RULE-011 +
 * no-default-export + public-api-must-be-explicit). The full-catalog codegen
 * (legacy `scripts/generate-rule-registry.mjs`) folds these into the global
 * `ruleRegistry`; here the list is hand-written, mirroring the v1 manual-registry
 * seam in rules-core. The deferred GRAPH rule `no-import-cycles` will be added to a
 * separate `graphRuleRegistry` when the module-graph batch lands.
 */
export const moduleBoundariesRules: ReadonlyArray<Rule> = [
  noDeepRelativeImport,
  noDefaultExport,
  publicApiMustBeExplicit,
];

// Self-barrel: `import { RulesModuleBoundaries } from "@tsnuke/rules-module-boundaries-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesModuleBoundaries from "./index.js";
