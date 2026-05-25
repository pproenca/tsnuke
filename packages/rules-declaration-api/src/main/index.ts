/**
 * `@ts-fix/rules-declaration-api-effect` — the `declaration-api` rule category
 * (RULE-025), the FIRST SYN AST rule-category slice on the Effect-native substrate.
 *
 * Four Tier-1 (SYN) AST predicates, ported verbatim from legacy
 * `packages/ts-fix-rules/src/rules/declaration-api/`:
 *   - `explicitMemberAccessibility` — class members missing an access modifier.
 *   - `explicitModuleBoundaryTypes` — exported functions missing a return type.
 *   - `noExportAssignment` — CommonJS-style `export = …`.
 *   - `noMutableExports` — `export let` / `export var`.
 *
 * Each rule is a plain-TS `ts.SyntaxKind → visitor` map (NOT Effect-wrapped) built
 * with `defineRule` from `@ts-fix/rules-core-effect`; the engine drives them via
 * the shared `runRule` walk/dispatch. The data CONTRACTS (`Diagnostic`, `RuleMeta`)
 * live in `@ts-fix/contracts-effect` and the substrate (`defineRule`, `Rule`,
 * `RuleContext`, `runRule`) in `@ts-fix/rules-core-effect` — this slice consumes
 * both and re-exports NOTHING it does not own (barrel hygiene). See
 * TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

import type { Rule } from "@ts-fix/rules-core-effect";

import { rule as explicitMemberAccessibility } from "./explicit-member-accessibility.js";
import { rule as explicitModuleBoundaryTypes } from "./explicit-module-boundary-types.js";
import { rule as noExportAssignment } from "./no-export-assignment.js";
import { rule as noMutableExports } from "./no-mutable-exports.js";

// The four SYN rules, exported by stable name.
export {
  explicitMemberAccessibility,
  explicitModuleBoundaryTypes,
  noExportAssignment,
  noMutableExports,
};

/** The `declaration-api` category as a registry-ready array (codegen seam). */
export const declarationApiRules: ReadonlyArray<Rule> = [
  explicitMemberAccessibility,
  explicitModuleBoundaryTypes,
  noExportAssignment,
  noMutableExports,
];

// Self-barrel: `import { RulesDeclarationApi } from "@ts-fix/rules-declaration-api-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesDeclarationApi from "./index.js";
