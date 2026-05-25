# Transformation Notes — `type-safety` rule category → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-fix type-safety effect`.
Source (READ-ONLY): `legacy/ts-fix/packages/ts-fix-rules/src/rules/type-safety/**`
(6 SYN rules + 6 TYP rules + their colocated `*.test.ts` behavioral specs). Target:
`modernized/rules-type-safety/effect/` (package `@ts-fix/rules-type-safety-effect`).

Implements **RULE-006** (`any` density budget, >5 / file, exclusive) and the
**RULE-025** type-safety row (per-rule detection predicates for the `type-safety`
category, a.k.a. "Type Safety" — `any`-density plus the `no-unsafe-*` type-aware
family). This category spans BOTH analysis tiers: 6 syntactic (SYN) rules and 6
type-aware (TYP) rules. Each rule is a pure `SyntaxKind → visitor` map plugging into
the rule substrate; **NO** rule is `Effect`-wrapped (visitors are sync AST callbacks —
a fiber buys nothing for an in-memory `ts.forEachChild` walk, matching the rules-core
substrate's own design).

**Result:** 72/72 characterization tests pass across 13 files · `tsc --noEmit` clean
under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Both `file:`
deps (`@ts-fix/rules-core-effect`, `@ts-fix/contracts-effect`) link and inline
correctly under Vitest's esbuild transform. The 6 TYP rules run through
`runTypeAwareRule` (real one-file `ts.Program` + live `ts.TypeChecker`); the 6 SYN rules
run through `runRule`. Each TYP rule is also proven inert under `runRule` (no checker).

---

## 1. Mapping table (legacy → target, all 12 rules)

| #  | Rule id | Legacy source | Target `src/main/` | Tier | Node kind(s) walked | Checker API used | `fixKind` | Severity | Tests |
|----|---------|---------------|--------------------|------|---------------------|------------------|-----------|----------|-------|
| 1  | `any-density-budget` | `any-density-budget.ts` | `any-density-budget.ts` | SYN | `SourceFile` (whole-file `AnyKeyword` count) | — | `manual` | warning | 6 |
| 2  | `no-explicit-any` | `no-explicit-any.ts` | `no-explicit-any.ts` | SYN | `AnyKeyword` | — | `manual` | warning | 3 |
| 3  | `no-record-string-unknown` | `no-record-string-unknown.ts` | `no-record-string-unknown.ts` | SYN | `TypeReference` / `TypeLiteral` / `ExpressionWithTypeArguments` | — | `manual` | warning | 6 |
| 4  | `no-unknown-return` | `no-unknown-return.ts` | `no-unknown-return.ts` | SYN | `FunctionDeclaration` / `FunctionExpression` / `ArrowFunction` / `MethodDeclaration` | — | `manual` | warning | 6 |
| 5  | `no-unnecessary-instanceof` | `no-unnecessary-instanceof.ts` | `no-unnecessary-instanceof.ts` | **TYP** | `BinaryExpression` (`instanceof`) | `getTypeAtLocation` · `isUnion` · `TypeFlags.Any\|Unknown` mask · `getConstructSignatures` · `getReturnType` · `getSymbol` | `manual` | warning | 4 |
| 6  | `no-unnecessary-typeof` | `no-unnecessary-typeof.ts` | `no-unnecessary-typeof.ts` | **TYP** | `BinaryExpression` (`typeof … === "…"`) | `getTypeAtLocation` · `isUnion` · `TypeFlags.*Like` masks · `getCall/ConstructSignatures` | `manual` | warning | 5 |
| 7  | `no-unsafe-argument` | `no-unsafe-argument.ts` | `no-unsafe-argument.ts` | **TYP** | `CallExpression` / `NewExpression` | `getResolvedSignature` · `getTypeAtLocation` · `getTypeOfSymbolAtLocation` · `TypeFlags.Any\|Unknown` mask | `manual` | **error** | 6 |
| 8  | `no-unsafe-call` | `no-unsafe-call.ts` | `no-unsafe-call.ts` | **TYP** | `CallExpression` | `getTypeAtLocation` · `TypeFlags.Any` mask | `manual` | **error** | 4 |
| 9  | `no-unsafe-member-access` | `no-unsafe-member-access.ts` | `no-unsafe-member-access.ts` | **TYP** | `PropertyAccessExpression` / `ElementAccessExpression` | `getTypeAtLocation` · `TypeFlags.Any` mask | `manual` | **error** | 4 |
| 10 | `no-unsafe-return` | `no-unsafe-return.ts` | `no-unsafe-return.ts` | **TYP** | `ReturnStatement` | `getTypeAtLocation` · `TypeFlags.Any` mask | `manual` | warning | 5 |
| 11 | `no-wrapper-object-types` | `no-wrapper-object-types.ts` | `no-wrapper-object-types.ts` | SYN | `TypeReference` / `TypeLiteral` / `NewExpression` | — | `manual` | warning | 9 |
| 12 | `prefer-type-guard-predicate` | `prefer-type-guard-predicate.ts` | `prefer-type-guard-predicate.ts` | SYN | `FunctionDeclaration` / `FunctionExpression` / `ArrowFunction` / `MethodDeclaration` | — | `manual` | warning | 5 |

Plus a category barrel test (`src/test/index.test.ts`, 9 tests) asserting the 12-rule
bundle in id order, id uniqueness, the SYN(6)/TYP(6) split with explicit id lists, that
EVERY TYP rule declares `requires: ["typecheck:ok"]` (and no SYN rule does), the three
`error`-severity call-site `no-unsafe-*` bans (`no-unsafe-argument` / `no-unsafe-call` /
`no-unsafe-member-access`), and the absence of any RULE-026 broken `auto-fix` rule (the
whole category is `manual`). **Total: 72 tests across 13 files.**

META was ported **verbatim** (id / severity / category / tier / fixKind / tags /
recommendation, plus `requires: ["typecheck:ok"]` on each of the 6 TYP rules). The
PREDICATE bodies were copied character-for-character — every `ts.is*` guard, the
`ANY_DENSITY_THRESHOLD = 5` constant used **exclusively** (`count <= THRESHOLD` returns,
so exactly 5 is allowed and 6 fires), the once-per-file `SourceFile`-keyed emission for
`any-density-budget`, the `TypeFlags` bit-masks / `getConstructSignatures` /
`getResolvedSignature` / `getTypeOfSymbolAtLocation` / `getSymbol` checker calls of the
TYP rules, the 1-based `line + 1` / `column + 1`, and the message + help text. The ONLY
edit applied to each rule file was the import rewrite:

  - `import { defineRule } from "../../define-rule.js"` →
    `import { defineRule } from "@ts-fix/rules-core-effect"`
  - `import type { RuleContext } from "../../define-rule.js"` →
    `import type { RuleContext } from "@ts-fix/rules-core-effect"` (the 4 rules that
    take a shared `RuleContext`-typed helper: `no-record-string-unknown`,
    `no-unknown-return`, `no-wrapper-object-types`, `prefer-type-guard-predicate`,
    `no-unsafe-argument`, `no-unsafe-member-access`).

### `any-density-budget` (RULE-006) — mechanism ported verbatim

`any-density-budget` does NOT walk individual `any` annotations like `no-explicit-any`.
It hooks the `SourceFile`-keyed visitor, walks the whole subtree once counting
`ts.SyntaxKind.AnyKeyword` nodes, and reports a SINGLE diagnostic at the file start
(`line: 1, column: 1`) only when `count > ANY_DENSITY_THRESHOLD` (5, EXCLUSIVE). `runRule`
fires the `SourceFile` visitor exactly once for the whole file (see
`rules-core/effect/src/main/runRule.ts`), so this mechanism works unchanged against the
new substrate — proven by the boundary tests (exactly 5 → no fire; 6 → fire; 20 → still
exactly one diagnostic carrying the count `20`).

---

## 2. Deviations from legacy (all consume-substrate / no behavior change)

This slice introduces **NO** behavioral deviations from the legacy rules. The
diagnostics emitted are byte-identical (same rule id, severity, tier, category, message,
help, 1-based position). What changed is purely structural:

1. **Substrate is consumed, not vendored.** Legacy rules imported `defineRule` /
   `RuleContext` from a sibling file (`../../define-rule.js`). Here they import them from
   `@ts-fix/rules-core-effect`, and the `Diagnostic`/`RuleMeta` contracts live in
   `@ts-fix/contracts-effect`. This slice is a CONSUMER of both `file:` deps and does
   not re-publish or re-vendor any of their symbols (barrel hygiene — `src/main/index.ts`
   exports only the 12 rules + the `typeSafetyRules` bundle).

2. **Drivers come from rules-core.** Tests import `runRule` (SYN) and `runTypeAwareRule`
   (TYP) from `@ts-fix/rules-core-effect` instead of the legacy
   `../../test-utils.js`. These are the SAME walk/dispatch the engine uses, so the tests
   exercise the production path, not a test-only fork. The TYP rules run under a real
   one-file `ts.Program` built with the default lib, so the checker resolves `Promise`,
   unions, classes, arrays, etc.

3. **No RULE-026 quirk in this category.** NO `type-safety` rule declares
   `fixKind: "auto-fix"`; all 12 are `manual`. The barrel test asserts the empty
   `auto-fix` set so a future regression that wrongly adds one would fail.

**Equivalence proof = the ported legacy test vectors.** Every legacy `*.test.ts` case
was carried over verbatim, then AUGMENTED with:

  - **`any-density-budget` boundary** (RULE-006): exactly 5 `any` → NO fire (threshold
    is exclusive); 6 → fire; 20 → still exactly ONE diagnostic at `1:1` (fires once per
    file regardless of count); 0 `any` → silent.
  - **`no-unsafe-*` family negatives**: a typed variable passed/returned/accessed is NOT
    flagged; `any` into an `unknown` parameter is safe; element access on a typed array
    is safe; a bare `return;` is skipped; a typed function value call is safe; `typeof`
    on `unknown` bails; a subclass `instanceof` guard is left alone.
  - **Each TYP rule proven inert via `runRule`** (no checker → early return → 0
    diagnostics), proving the BC-10 / Tier-1 gating.
  - Explicit assertions on **position / message / severity / tier / rule-id** where the
    legacy test only counted diagnostics.

---

## 3. SYN vs TYP — how the engine drives this category

  - **6 SYN rules** activate on the Tier-1 path. The engine parses the file once and
    dispatches each rule's `SyntaxKind → visitor` (`any-density-budget`'s `SourceFile`
    visitor fires once for the whole file). No checker required → always available, even
    on the broken-project path (BC-10).
  - **6 TYP rules** — the `no-unsafe-*` family (`no-unsafe-argument`, `no-unsafe-call`,
    `no-unsafe-member-access`, `no-unsafe-return`) plus the two unnecessary-guard rules
    (`no-unnecessary-instanceof`, `no-unnecessary-typeof`) — each declares
    `requires: ["typecheck:ok"]` and reads `ctx.checker`. Their visitors early-return
    when `ctx.checker === undefined`, so under `runRule` (no checker) they emit NOTHING —
    the Tier-1 / gated-path behavior is proven by a `runRule` case in each TYP test file.
    Under `runTypeAwareRule` (one-file `ts.Program` + live `ts.TypeChecker`) they inspect
    types via `checker.getTypeAtLocation(...)` and the `TypeFlags` bit-masks /
    construct-signature / resolved-signature APIs exactly as legacy.

The engine selects the driver by tier (BC-18/RULE-018): SYN/GRAPH/CFG run regardless;
TYP runs only when Tier-2 is open (`typecheck:ok` present). This slice's tests mirror
that selection exactly.

---

## 4. Follow-ups

  - **RULE-006 threshold tunability (open SME question, RULE-025).** `ANY_DENSITY_THRESHOLD`
    is a hard-coded module constant (`5`, exclusive). BUSINESS_RULES.md §"Rules requiring
    SME confirmation" #5 asks whether the budget thresholds (`any` density 5, generic
    params 4, union members 12, …) are deliberate validated product policy or placeholder
    defaults — this decides whether `5` becomes user-tunable config in the rewrite. Ported
    verbatim here (no config surface introduced); flag for the engine/config slice.
  - **The 6 TYP `no-unsafe-*` rules are gated on `typecheck:ok`.** They emit nothing unless
    Tier-2 is open; the engine supplies the `ts.TypeChecker` on that path
    (`runTypeAwareRule`'s mechanism). When the central registry/codegen seam lands, register
    the `typeSafetyRules` bundle alongside the other category slices — the engine already
    drives SYN via `runRule` and TYP via `runTypeAwareRule`.
  - **De-vendoring is already done.** This slice consumes the canonical contracts and
    substrate from day one, so there is no vendored copy to retire later (contrast with the
    score/filter-pipeline/build-report slices flagged in the contracts notes).
