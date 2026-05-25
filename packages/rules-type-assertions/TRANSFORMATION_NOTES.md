# Transformation Notes — `type-assertions` rule category → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke type-assertions effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/rules/type-assertions/**`
(12 SYN rules + 1 TYP rule + their colocated `*.test.ts` behavioral specs). Target:
`modernized/rules-type-assertions/effect/` (package `@tsnuke/rules-type-assertions-effect`).

Implements **RULE-025** (per-rule detection predicates for the `type-assertions`
category, a.k.a. "Type Assertions & Escapes"). This category spans BOTH analysis tiers:
12 syntactic (SYN) rules and 1 type-aware (TYP) rule. Each rule is a pure
`SyntaxKind → visitor` map plugging into the rule substrate; **NO** rule is
`Effect`-wrapped (visitors are sync AST callbacks — a fiber buys nothing for an in-memory
`ts.forEachChild` walk, matching the rules-core substrate's own design).

**Result:** 69/69 characterization tests pass across 14 files · `tsc --noEmit` clean
under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Both `file:`
deps (`@tsnuke/rules-core-effect`, `@tsnuke/contracts-effect`) link and inline
correctly under Vitest's esbuild transform. The TYP rule runs through `runTypeAwareRule`
(real one-file `ts.Program` + live `ts.TypeChecker`); the SYN rules run through `runRule`.

---

## 1. Mapping table (legacy → target, all 13 rules)

| #  | Rule id | Legacy source | Target `src/main/` | Tier | Node kind(s) walked | `fixKind` | Severity | Tests |
|----|---------|---------------|--------------------|------|---------------------|-----------|----------|-------|
| 1  | `no-angle-bracket-assertion` | `no-angle-bracket-assertion.ts` | `no-angle-bracket-assertion.ts` | SYN | `TypeAssertionExpression` | `codemod` | warning | 3 |
| 2  | `no-assertion-on-json-parse` | `no-assertion-on-json-parse.ts` | `no-assertion-on-json-parse.ts` | SYN | `AsExpression` | `manual` | warning | 5 |
| 3  | `no-cast-after-guard` | `no-cast-after-guard.ts` | `no-cast-after-guard.ts` | SYN | `ConditionalExpression` | `manual` | warning | 7 |
| 4  | `no-cast-in-return` | `no-cast-in-return.ts` | `no-cast-in-return.ts` | SYN | `ReturnStatement` | `manual` | warning | 5 |
| 5  | `no-double-assertion` | `no-double-assertion.ts` | `no-double-assertion.ts` | SYN | `AsExpression` | `manual` | **error** | 4 |
| 6  | `no-non-null-asserted-optional-chain` | `no-non-null-asserted-optional-chain.ts` | `no-non-null-asserted-optional-chain.ts` | SYN | `NonNullExpression` | `manual` | **error** | 4 |
| 7  | `no-non-null-assertion` | `no-non-null-assertion.ts` | `no-non-null-assertion.ts` | SYN | `NonNullExpression` | `manual` | warning | 3 |
| 8  | `no-ts-ignore` | `no-ts-ignore.ts` | `no-ts-ignore.ts` | SYN | `SourceFile` (full-text scan) | `manual` | warning | 5 |
| 9  | `no-ts-nocheck` | `no-ts-nocheck.ts` | `no-ts-nocheck.ts` | SYN | `SourceFile` (full-text scan) | `manual` | **error** | 4 |
| 10 | `no-unnecessary-non-null-assertion` | `no-unnecessary-non-null-assertion.ts` | `no-unnecessary-non-null-assertion.ts` | **TYP** | `NonNullExpression` (needs `ctx.checker`) | `manual` | warning | 5 |
| 11 | `no-unsafe-object-assertion` | `no-unsafe-object-assertion.ts` | `no-unsafe-object-assertion.ts` | SYN | `AsExpression` | `manual` | warning | 6 |
| 12 | `prefer-satisfies-over-as` | `prefer-satisfies-over-as.ts` | `prefer-satisfies-over-as.ts` | SYN | `AsExpression` | `codemod` | warning | 6 |
| 13 | `ts-expect-error-requires-description` | `ts-expect-error-requires-description.ts` | `ts-expect-error-requires-description.ts` | SYN | `SourceFile` (full-text scan) | `manual` | warning | 4 |

Plus a category barrel test (`src/test/index.test.ts`, 8 tests) asserting the 13-rule
bundle in id order, id uniqueness, the SYN(12)/TYP(1) split, the TYP rule's
`requires: ["typecheck:ok"]`, the three `error`-severity escape-hatch bans, and the
absence of any RULE-026 broken `auto-fix` rule. **Total: 69 tests.**

META was ported **verbatim** (id / severity / category / tier / fixKind / tags /
recommendation, plus `requires` on the TYP rule). The PREDICATE bodies were copied
character-for-character — every `ts.is*` guard, the exact conditions, the
parenthesis-unwrapping loops, the comment-scanning regexes for the `@ts-*` directive
rules, the 1-based `line + 1` / `column + 1`, and the message + help text. The ONLY edit
applied to each rule file was the import rewrite:
`import { defineRule } from "../../define-rule.js"` →
`import { defineRule } from "@tsnuke/rules-core-effect"`.

### Comment-directive rules (mechanism ported verbatim)

Three rules — `no-ts-ignore`, `no-ts-nocheck`, `ts-expect-error-requires-description` —
do NOT walk a typed AST node. Comments are trivia, not nodes, so they hook the
`SourceFile`-keyed visitor and scan `node.getFullText()` (or `ctx.sourceFile.getFullText()`)
with a regex:

  - `no-ts-ignore` — global `/\/\/\s*@ts-ignore\b/g`, reports EVERY match (a
    `@ts-ignore` with a trailing reason is still banned).
  - `no-ts-nocheck` — single multiline `/^[ \t]*\/[/*][ \t]*@ts-nocheck\b/m`, anchored to
    line start so the token inside a string literal is NOT matched; line- AND
    block-comment forms both match.
  - `ts-expect-error-requires-description` — global multiline
    `/^[ \t]*\/\/[ \t]*@ts-expect-error[ \t]*$/gm`; only a BARE directive (nothing after
    it on the line) is flagged — any trailing text exempts it.

`runRule` fires the `SourceFile` visitor once for the whole file (see
`rules-core/effect/src/main/runRule.ts`), so this mechanism works unchanged against the
new substrate. The exact `lastIndex` reset / `RegExpExecArray` iteration of each legacy
rule was preserved (the module-level `const` regexes carry global-flag state between
runs; the legacy code resets `lastIndex = 0` where needed, and that reset is kept).

---

## 2. Deviations from legacy (all consume-substrate / no behavior change)

This slice introduces **NO** behavioral deviations from the legacy rules. The
diagnostics emitted are byte-identical (same rule id, severity, tier, category, message,
help, 1-based position). What changed is purely structural:

1. **Substrate is consumed, not vendored.** Legacy rules imported `defineRule` from a
   sibling file (`../../define-rule.js`). Here they import it from
   `@tsnuke/rules-core-effect`, and the `Diagnostic`/`RuleMeta` contracts live in
   `@tsnuke/contracts-effect`. This slice is a CONSUMER of both `file:` deps and does
   not re-publish or re-vendor any of their symbols (barrel hygiene — `src/main/index.ts`
   exports only the 13 rules + the `typeAssertionsRules` bundle).

2. **Drivers come from rules-core.** Tests import `runRule` (SYN) and `runTypeAwareRule`
   (TYP) from `@tsnuke/rules-core-effect` instead of the legacy
   `../../test-utils.js`. These are the SAME walk/dispatch the engine uses, so the tests
   exercise the production path, not a test-only fork.

3. **No RULE-026 quirk in this category.** Unlike `naming-idioms` (which holds 4 broken
   `auto-fix` rules), NO `type-assertions` rule declares `fixKind: "auto-fix"`. They are
   `codemod` (advisory: `no-angle-bracket-assertion`, `prefer-satisfies-over-as`) or
   `manual` (the rest). The barrel test asserts the empty `auto-fix` set so a future
   regression that wrongly adds one would fail.

**Equivalence proof = the ported legacy test vectors.** Every legacy `*.test.ts` case
was carried over verbatim, then AUGMENTED with: (a) negatives that must NOT fire (safe
casts/assertions, named-type asserts, plain member access, a different `.parse`,
`JSON.stringify`, casting a different identifier than the one guarded, `as any` /
`as unknown` exemptions, an operand that can be `null`/`undefined`); (b) comment-rule
edges (`@ts-ignore` with a reason still flagged; `@ts-expect-error` WITH a description
not flagged; block-comment `@ts-nocheck`); (c) explicit assertions on
position / message / severity / tier / rule-id where the legacy test only counted
diagnostics.

---

## 3. SYN vs TYP — how the engine drives this category

  - **12 SYN rules** activate on the Tier-1 path. The engine parses the file once and
    dispatches each rule's `SyntaxKind → visitor` (the comment rules' `SourceFile`
    visitor fires once for the whole file). No checker required → always available, even
    on the broken-project path (BC-10).
  - **1 TYP rule** (`no-unnecessary-non-null-assertion`) declares
    `requires: ["typecheck:ok"]` and reads `ctx.checker`. Its visitor early-returns when
    `ctx.checker === undefined`, so under `runRule` (no checker) it emits NOTHING — the
    Tier-1 / gated-path behavior is proven by the `runRule` test case. Under
    `runTypeAwareRule` (which builds a one-file `ts.Program` with the real default lib and
    a live `ts.TypeChecker`), it inspects the operand's type via
    `checker.getTypeAtLocation(node.expression)`, splits a union into constituents, and
    flags the `!` only when NO constituent carries `TypeFlags.Null | TypeFlags.Undefined`.
    `no-non-null-assertion` (SYN) is its companion that flags EVERY `!` unconditionally.

The engine selects the driver by tier (BC-18/RULE-018): SYN/GRAPH/CFG run regardless;
TYP runs only when Tier-2 is open (`typecheck:ok` present). This slice's tests mirror
that selection exactly.

---

## 4. Follow-ups

  - **Engine wiring.** The `typeAssertionsRules` bundle is ready for the central
    registry/codegen seam (the v1 hand-written `ruleRegistry` in rules-core). When the
    full catalog lands, register this bundle alongside the other category slices; the
    engine already drives SYN via `runRule` and TYP via `runTypeAwareRule`.
  - **TYP coverage breadth.** Only `no-unnecessary-non-null-assertion` is type-aware in
    this category. The broader `no-unsafe-*` type-aware family (RULE-025, `type-safety`
    category) is a separate slice; the checker-handling pattern proven here
    (`ctx.checker` early-return + `runTypeAwareRule`) carries over directly.
  - **De-vendoring is already done.** This slice consumes the canonical contracts and
    substrate from day one, so there is no vendored copy to retire later (contrast with
    the score/filter-pipeline/build-report slices flagged in the contracts notes).
