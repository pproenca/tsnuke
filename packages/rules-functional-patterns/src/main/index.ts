/**
 * `@tsnuke/rules-functional-patterns-effect` — the `Functional Patterns` rule
 * category: SYN AST predicates that catch GoF / imperative class shapes a
 * TS-speaker should write as a function, tagged union, or stream method.
 *
 * The rules invert the patterns of `implementation-functional-patterns` (the
 * dot-skills curated catalog): each rule's `recommendation` paraphrases the
 * skill rule its detection enforces.
 *
 * Seven SYN rules:
 *   - `no-singleton-class` — class with `private static instance` + `static
 *     getInstance` (use module-scope const / lazy `??=`).
 *   - `no-mutable-builder-class` — class with ≥2 `return this` methods + a
 *     `build()`/`create()`/`finish()` finisher (use object literal or fluent
 *     immutable builder).
 *   - `no-factory-class` — concrete class whose only instance method is named
 *     `create`/`make`/`build`/`of`/`from` (use a factory function).
 *   - `prefer-generator-over-iterator-class` — class with both `next()` and
 *     `[Symbol.iterator]()` (use a generator function).
 *   - `prefer-reduce-over-imperative-sum` — `for (...) total += f(x)` (use
 *     `.reduce`).
 *   - `prefer-group-by-over-imperative-groups` — `if (!groups[k]) groups[k] =
 *     []; groups[k].push(x)` (use `Object.groupBy` / `Map.groupBy`).
 *   - `prefer-flatmap-over-reduce-concat` — `reduce((a, x) => a.concat(...),
 *     [])` (use `.flatMap`).
 *
 * Each rule is a plain-TS `ts.SyntaxKind → visitor` map (NOT Effect-wrapped)
 * built with `defineRule` from `@tsnuke/rules-core-effect`. All seven ship with
 * `severity: "warning"`, `fixKind: "manual"`, tagged `ts-idiom`. No auto-fixes:
 * every detection requires a real refactor — `--explain` carries the recipe.
 */

import type { Rule } from "@tsnuke/rules-core-effect";

import { rule as noSingletonClass } from "./no-singleton-class.js";
import { rule as noMutableBuilderClass } from "./no-mutable-builder-class.js";
import { rule as noFactoryClass } from "./no-factory-class.js";
import { rule as preferGeneratorOverIteratorClass } from "./prefer-generator-over-iterator-class.js";
import { rule as preferReduceOverImperativeSum } from "./prefer-reduce-over-imperative-sum.js";
import { rule as preferGroupByOverImperativeGroups } from "./prefer-group-by-over-imperative-groups.js";
import { rule as preferFlatmapOverReduceConcat } from "./prefer-flatmap-over-reduce-concat.js";

export {
  noSingletonClass,
  noMutableBuilderClass,
  noFactoryClass,
  preferGeneratorOverIteratorClass,
  preferReduceOverImperativeSum,
  preferGroupByOverImperativeGroups,
  preferFlatmapOverReduceConcat,
};

/** The `functional-patterns` category as a registry-ready array. */
export const functionalPatternsRules: ReadonlyArray<Rule> = [
  noSingletonClass,
  noMutableBuilderClass,
  noFactoryClass,
  preferGeneratorOverIteratorClass,
  preferReduceOverImperativeSum,
  preferGroupByOverImperativeGroups,
  preferFlatmapOverReduceConcat,
];

// Self-barrel: `import { RulesFunctionalPatterns } from
// "@tsnuke/rules-functional-patterns-effect"` resolves to this namespace.
export * as RulesFunctionalPatterns from ".";
