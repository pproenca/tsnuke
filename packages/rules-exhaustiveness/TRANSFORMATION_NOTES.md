# Transformation Notes — `exhaustiveness` rule category → Effect-native substrate

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-fix exhaustiveness effect`.

Source (READ-ONLY): `legacy/ts-fix/packages/ts-fix-rules/src/rules/exhaustiveness/`
(8 rules — 3 SYN + 5 TYP — plus their colocated `*.test.ts`).
Target: `modernized/rules-exhaustiveness/effect/` — package `@ts-fix/rules-exhaustiveness-effect`.

This is a SYN/TYP-mixed rule-category slice on the Effect-native rule substrate, modeled on
the completed `error-handling` sibling. It is a **true strangler-fig**: it CONSUMES the
already-completed substrate (`@ts-fix/rules-core-effect` for `defineRule` / `runRule` /
`runTypeAwareRule` / `Rule` / `RuleContext`) and the canonical data contracts
(`@ts-fix/contracts-effect` for `Diagnostic` / `RuleMeta`, reached transitively through
rules-core). Neither dependency was modified — nor was `legacy/`. Same two-`file:`-dep + inline
+ `typescript`-runtime config structure as the `error-handling` sibling.

Implements the `exhaustiveness` slice of **RULE-025** (per-rule detection predicates by
category) plus **RULE-016** (the discriminated-union ≥2-arm same-discriminant threshold). Each
rule is a pure `ts.SyntaxKind → visitor` map built with `defineRule`; the engine drives SYN
rules via `runRule` (one parse, walk, dispatch by kind) and TYP rules via `runTypeAwareRule`
(one-file `ts.Program` + live `ts.TypeChecker`).

**Result:** 73/73 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.

**`file:` dependency imports + `runTypeAwareRule`:** both `file:../../rules-core/effect`
(`@ts-fix/rules-core-effect`) and `file:../../contracts/effect` (`@ts-fix/contracts-effect`)
import cleanly by package name. `typescript` is a real runtime DEPENDENCY (the rules call the
compiler API at runtime — `ts.is*`, `ts.TypeFlags`, `checker.getTypeAtLocation`,
`checker.isArrayType` / `isTupleType`, `type.isUnion()` / `isStringLiteral()` / `isNumberLiteral()`),
not a devDependency. Vitest transpiles the two `.ts`-entry `file:` deps at test time via
`vitest.config.ts → test.server.deps.inline: ["@ts-fix/rules-core-effect",
"@ts-fix/contracts-effect"]` (contracts must be inlined too because rules-core imports it).
`runTypeAwareRule` (the TYP driver) builds the real default lib, so the checker resolves array /
readonly-array / tuple types, nullability, and literal unions correctly. No relative-import
fallback was needed.

---

## 1. Mapping table (legacy → target)

| Rule (id) | Tier | Legacy source | Target | Visitor `SyntaxKind`(s) |
|-----------|------|---------------|--------|--------------------------|
| `default-case-last` | SYN | `exhaustiveness/default-case-last.ts` | `src/main/default-case-last.ts` | `SwitchStatement` |
| `no-constant-condition` | SYN | `exhaustiveness/no-constant-condition.ts` | `src/main/no-constant-condition.ts` | `IfStatement`, `ConditionalExpression` |
| `prefer-discriminated-union` | SYN | `exhaustiveness/prefer-discriminated-union.ts` | `src/main/prefer-discriminated-union.ts` | `SwitchStatement`, `IfStatement` |
| `no-for-in-array` | TYP | `exhaustiveness/no-for-in-array.ts` | `src/main/no-for-in-array.ts` | `ForInStatement` |
| `no-unnecessary-boolean-literal-compare` | TYP | `exhaustiveness/no-unnecessary-boolean-literal-compare.ts` | `src/main/no-unnecessary-boolean-literal-compare.ts` | `BinaryExpression` |
| `no-unnecessary-condition` | TYP | `exhaustiveness/no-unnecessary-condition.ts` | `src/main/no-unnecessary-condition.ts` | `IfStatement`, `WhileStatement`, `DoStatement`, `ConditionalExpression` |
| `prefer-nullish-coalescing` | TYP | `exhaustiveness/prefer-nullish-coalescing.ts` | `src/main/prefer-nullish-coalescing.ts` | `BinaryExpression` |
| `switch-exhaustiveness-check` | TYP | `exhaustiveness/switch-exhaustiveness-check.ts` | `src/main/switch-exhaustiveness-check.ts` | `SwitchStatement` |

META (id / severity / category / tier / requires / fixKind / tags / recommendation) and the
predicate body (the exact `ts.is*` guards, helper functions, `ts.TypeFlags` masks, 1-based
line/column, message/help strings) were ported **verbatim**. The ONLY change to each rule file
is the import line: `defineRule` (and the `RuleContext` type, for `no-constant-condition`,
`prefer-discriminated-union`, and `no-unnecessary-condition`) now come from
`@ts-fix/rules-core-effect` instead of the legacy relative `../../define-rule.js`.

All eight rules carry `category: "Exhaustiveness & Narrowing"`. Severities preserved verbatim:
`no-for-in-array` and `switch-exhaustiveness-check` are `error`; the other six are `warning`.
`switch-exhaustiveness-check` is the only `fixKind: "codemod"`; the rest are `manual`.

### Predicate / edge-case preservation (per rule)

- **default-case-last** (SYN) — `SwitchStatement` with a `default` clause that is not the last
  clause. No `default` ⇒ no report; `default` already last ⇒ no report. Reports at the
  misplaced `default` clause's start (1-based).
- **no-constant-condition** (SYN) — an `IfStatement` whose `expression`, or a
  `ConditionalExpression` whose `condition`, is a literal: `true`/`false` keyword, numeric
  literal, string literal, or no-substitution template literal. `while`/`for` loops are NOT
  visited — `while (true)` stays a legitimate idiom. Reports at the condition expression.
- **prefer-discriminated-union** (SYN, **RULE-016**) — two forms:
  - `switch (typeof x)` (the switched expression, unwrapped of parentheses, is a
    `typeof` expression) ⇒ report at the switch.
  - if/else-if chain: fires ONLY on the chain HEAD (skips an `if` that is its parent's
    `elseStatement`); walks the `elseStatement` spine collecting each arm's discriminant via
    `typeTestDiscriminant` (`typeof E === "..."` → E's text, `E instanceof C` → E's text);
    requires **≥2 arms** AND a non-null FIRST discriminant AND **every** arm equal to that
    first discriminant. A single `if`, a chain with a non-type-test arm, or a chain over
    different discriminants all abort (conservative, near-zero false positives).
- **no-for-in-array** (TYP) — `ForInStatement` where `checker.getTypeAtLocation(node.expression)`
  is array-like: `isArrayLike` walks union constituents, BAILS on `any`/`unknown`/type-parameter
  (no false positive), SKIPS `null`/`undefined` constituents, and requires each remaining part to
  be `checker.isArrayType` / `isTupleType` / (numeric index type + number-like `length`). Plain
  objects (`Record<string, number>`) and `for...of` are not flagged. Severity `error`.
- **no-unnecessary-boolean-literal-compare** (TYP) — `BinaryExpression` with a `===`/`==`/`!==`/`!=`
  operator where EXACTLY one side is a `true`/`false` keyword literal and the OTHER side's type
  has `ts.TypeFlags.BooleanLike`. Both-literal or neither-literal ⇒ out of scope; non-comparison
  operators (`&&`) ⇒ ignored.
- **no-unnecessary-condition** (TYP) — checks the condition of `if`/`while`/`do`/ternary. Reports
  ONLY when every union part is a pure `Object` type, NO part carries a falsy/imprecise flag
  (`FALSY_OR_IMPRECISE_FLAGS` = any/unknown/null/undefined/boolean(+literal)/number(+literal)/
  bigint/string(+literal)/symbol/void/never), AND the type has ≥1 property — so bare `{}` (which
  accepts primitives) is excluded. Nullable objects and primitives are not flagged.
- **prefer-nullish-coalescing** (TYP) — `BinaryExpression` with the `||` (`BarBarToken`) operator
  whose LEFT operand's type (`isNullable`: any union constituent is `Null` or `Undefined`) is
  nullable. `&&` and existing `??` are not flagged.
- **switch-exhaustiveness-check** (TYP, **RULE-025 false-negative bias**) — see §2.

All five TYP rules early-return when `ctx.checker === undefined` (the Tier-1 / broken-project
path, BC-10) and so emit nothing under `runRule` — each is proven inert via `runRule` in its
characterization spec.

---

## 2. `switch-exhaustiveness-check` — intentional false-negative bias (RULE-025)

Ported VERBATIM, including its two conservative bail conditions, both of which make it
**false-negative-biased** (it would rather miss a real non-exhaustive switch than risk a false
positive):

1. **Non-literal union member ⇒ bail.** `literalMembers(discriminantType)` returns `null` the
   moment ANY union constituent is not a string/number literal (e.g. `"r" | "g" | string`). When
   it returns `null` the rule reports nothing — even though the `"r"`/`"g"` literals are
   plainly unhandled. (It also returns `null` for an empty literal set.)
2. **A `default` clause ⇒ bail.** If the switch has any `default` clause, `hasDefault` short-
   circuits the report ("a default branch makes it exhaustive by construction") — even when named
   literal cases are missing.

Both biases are asserted explicitly in `src/test/switch-exhaustiveness-check.test.ts`
("FALSE-NEGATIVE bias: …") so the behavior is pinned as intentional, not a latent bug.

---

## 3. Characterization tests = equivalence proof

TDD: tests written against the substrate's `runRule` (SYN) / `runTypeAwareRule` (TYP) drivers
imported from `@ts-fix/rules-core-effect`. **Every legacy `*.test.ts` case was ported**
(the behavioral-equivalence proof), plus the required additions:

- **prefer-discriminated-union**: single-`if` never fires; mixed-arm aborts; different-discriminant
  aborts; first-arm-not-a-type-test aborts; chain head fires exactly once (no double-count).
- **switch-exhaustiveness-check**: does NOT fire when a `default` exists; does NOT fire when a
  member is non-literal (the two false-negative biases); plus a numeric-literal-union positive.
- **TYP condition rules**: negatives added (nullable object, `&&`, existing `??`, two-literal
  compare, non-comparison op, plain object, `for...of`); extra `while`/`do`/ternary positives for
  `no-unnecessary-condition`; tuple positive for `no-for-in-array`.
- **Each TYP rule proven inert via `runRule`** (no checker ⇒ no diagnostics).
- Assertions cover position (1-based line/column), message, help, severity, category, tier, and
  rule-id.

Barrel test (`src/test/index.test.ts`): asserts the 8-rule `exhaustivenessRules` array, stable
id order, named-export identity, the 3-SYN / 5-TYP split, `requires: ["typecheck:ok"]` on all
five TYP rules, no `requires` on the SYN rules, and the two `error`-severity rules.

**Test totals:** 73 tests across 9 files, all passing.

---

## 4. Deviations from legacy

- **Consumes the shared substrate + contracts.** The rules import `defineRule` / `RuleContext`
  from `@ts-fix/rules-core-effect`, and the tests import `runRule` / `runTypeAwareRule` from
  the same package — instead of the legacy relative `../../define-rule.js` / `../../test-utils.js`.
  The `Diagnostic` / `RuleMeta` contracts come transitively from `@ts-fix/contracts-effect`.
  No predicate logic changed.
- **No re-export of rules-core / contracts symbols.** `src/main/index.ts` exports only what this
  slice OWNS: the eight rules by name + `exhaustivenessRules: ReadonlyArray<Rule>` (barrel
  hygiene — `Rule` is imported as a `type` only, not re-exported).
- **Plain-TS predicates, NOT Effect-wrapped.** Visitors are synchronous AST callbacks over the TS
  compiler API; a fiber buys nothing for an in-memory `ts.forEachChild` walk (consistent with the
  substrate's own stance and the sibling slices).
- **Equivalence basis** = the ported legacy characterization vectors (every legacy test case is
  preserved); there is no separate golden corpus.

---

## 5. Follow-ups

- **The 5 TYP rules are gated on `typecheck:ok`** (`requires: ["typecheck:ok"]`). The engine
  activates them only on the Tier-2 (`typecheck:ok`) path and supplies the `ts.TypeChecker`
  (BC-10 / RULE-018). On the Tier-1 / broken-project path they produce nothing by design (proven
  via `runRule` in their specs).
- **`switch-exhaustiveness-check` false-negative bias is intentional** per RULE-025 (bails on a
  non-literal union member or a `default` clause). If the product decides to tighten it (e.g. flag
  named-literal cases missing even alongside a `default`, or partial reasoning over mixed
  literal/non-literal unions), that is a deliberate behavior CHANGE — to be made against new
  vectors, not silently. Pinned by the "FALSE-NEGATIVE bias" tests.
- **`prefer-discriminated-union` is purely syntactic** (RULE-016 / SYN): `typeTestDiscriminant`
  compares discriminant SOURCE TEXT, not resolved symbols, so `x` vs `(x)` vs a shadowed `x`
  are matched/distinguished by text. A future TYP-tier variant could resolve the discriminant via
  the checker, but that would be a new rule, not a change to this one.
- **De-vendoring already done at the slice boundary**: this slice never vendored contracts or the
  substrate, so there is nothing here to de-vendor later (unlike the older score / filter-pipeline
  / build-report slices noted in the contracts package).
