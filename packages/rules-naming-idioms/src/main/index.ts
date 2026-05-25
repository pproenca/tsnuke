/**
 * `@ts-fix/rules-naming-idioms-effect` — the `naming-idioms` SYN rule category
 * (RULE-025), the LARGEST SYN category: 14 plain-TS AST/token predicates ported
 * verbatim from the legacy `packages/ts-fix-rules/src/rules/naming-idioms/**`.
 *
 * Each rule is a pure `SyntaxKind → visitor` map plugging into the rule substrate
 * (`defineRule` / `RuleContext` / `runRule`) from `@ts-fix/rules-core-effect`. The
 * data CONTRACTS (`Diagnostic`, `RuleMeta`, `Rule`) live in
 * `@ts-fix/contracts-effect` / `@ts-fix/rules-core-effect` and are NOT re-exported
 * here (barrel hygiene — this slice does not re-publish symbols it does not own).
 *
 * Preserved quirks (equivalence proof = the ported legacy vectors in `src/test/**`):
 *   - `triple-equals` ALLOWS the `== null` / `!= null` / `!= undefined` idiom (not flagged).
 *   - RULE-026 broken auto-fix: `triple-equals`, `no-var`, `no-const-enum`, and
 *     `no-inferrable-type-annotation` declare `fixKind: "auto-fix"` but emit NO `fix`
 *     payload — preserved verbatim (do NOT add fix payloads). See TRANSFORMATION_NOTES.md.
 *
 * The engine drives these via `runRule` (the Tier-1 walk/dispatch driver in rules-core).
 */

import type { Rule } from "@ts-fix/rules-core-effect";

import { rule as consistentTypeDefinitions } from "./consistent-type-definitions.js";
import { rule as noArrayConstructor } from "./no-array-constructor.js";
import { rule as noConstEnum } from "./no-const-enum.js";
import { rule as noEmptyInterface } from "./no-empty-interface.js";
import { rule as noInferrableTypeAnnotation } from "./no-inferrable-type-annotation.js";
import { rule as noJsonParseStringifyClone } from "./no-json-parse-stringify-clone.js";
import { rule as noNamespace } from "./no-namespace.js";
import { rule as noUnnecessaryTemplateLiteral } from "./no-unnecessary-template-literal.js";
import { rule as noVar } from "./no-var.js";
import { rule as pascalCaseTypes } from "./pascal-case-types.js";
import { rule as preferArrayMethods } from "./prefer-array-methods.js";
import { rule as preferOptionalChain } from "./prefer-optional-chain.js";
import { rule as preferUnionOverEnum } from "./prefer-union-over-enum.js";
import { rule as tripleEquals } from "./triple-equals.js";

// Each rule exported by stable name.
export {
  consistentTypeDefinitions,
  noArrayConstructor,
  noConstEnum,
  noEmptyInterface,
  noInferrableTypeAnnotation,
  noJsonParseStringifyClone,
  noNamespace,
  noUnnecessaryTemplateLiteral,
  noVar,
  pascalCaseTypes,
  preferArrayMethods,
  preferOptionalChain,
  preferUnionOverEnum,
  tripleEquals,
};

/** The 14 `naming-idioms` SYN rules, in id order — the category bundle the engine registers. */
export const namingIdiomsRules: ReadonlyArray<Rule> = [
  consistentTypeDefinitions,
  noArrayConstructor,
  noConstEnum,
  noEmptyInterface,
  noInferrableTypeAnnotation,
  noJsonParseStringifyClone,
  noNamespace,
  noUnnecessaryTemplateLiteral,
  noVar,
  pascalCaseTypes,
  preferArrayMethods,
  preferOptionalChain,
  preferUnionOverEnum,
  tripleEquals,
];

// Self-barrel: `import { RulesNamingIdioms } from "@ts-fix/rules-naming-idioms-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesNamingIdioms from "./index.js";
