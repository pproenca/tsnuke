# Transformation Notes — `naming-idioms` rule category → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor naming-idioms effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor-rules/src/rules/naming-idioms/**`
(14 SYN rules + their colocated `*.test.ts` behavioral specs). Target:
`modernized/rules-naming-idioms/effect/` (package `@ts-doctor/rules-naming-idioms-effect`).

Implements **RULE-025** (per-rule SYN detection predicates for the `naming-idioms`
category — the LARGEST SYN category at 14 rules) and preserves **RULE-026** (4 of the
5 broken auto-fix rules live here). Each rule is a pure `SyntaxKind → visitor` map
plugging into the rule substrate; **NO** rule is `Effect`-wrapped (visitors are sync
AST callbacks — a fiber buys nothing for an in-memory `ts.forEachChild` walk, matching
the rules-core substrate's own design).

**Result:** 72/72 characterization tests pass across 15 files · `tsc --noEmit` clean
under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Both `file:`
deps (`@ts-doctor/rules-core-effect`, `@ts-doctor/contracts-effect`) link and inline
correctly under Vitest's esbuild transform.

---

## 1. Mapping table (legacy → target, all 14 rules)

| # | Rule id | Legacy source | Target `src/main/` | Node kind(s) walked | `fixKind` | Severity | Tests |
|---|---------|---------------|--------------------|---------------------|-----------|----------|-------|
| 1 | `consistent-type-definitions` | `consistent-type-definitions.ts` | `consistent-type-definitions.ts` | `TypeAliasDeclaration` | `codemod` | warning | 8 |
| 2 | `no-array-constructor` | `no-array-constructor.ts` | `no-array-constructor.ts` | `CallExpression`, `NewExpression` | `codemod` | warning | 7 |
| 3 | `no-const-enum` | `no-const-enum.ts` | `no-const-enum.ts` | `EnumDeclaration` | **`auto-fix`** (RULE-026) | **error** | 4 |
| 4 | `no-empty-interface` | `no-empty-interface.ts` | `no-empty-interface.ts` | `InterfaceDeclaration` | `manual` | warning | 4 |
| 5 | `no-inferrable-type-annotation` | `no-inferrable-type-annotation.ts` | `no-inferrable-type-annotation.ts` | `VariableDeclaration` | **`auto-fix`** (RULE-026) | warning | 7 |
| 6 | `no-json-parse-stringify-clone` | `no-json-parse-stringify-clone.ts` | `no-json-parse-stringify-clone.ts` | `CallExpression` | `codemod` | warning | 4 |
| 7 | `no-namespace` | `no-namespace.ts` | `no-namespace.ts` | `ModuleDeclaration` | `codemod` | warning | 3 |
| 8 | `no-unnecessary-template-literal` | `no-unnecessary-template-literal.ts` | `no-unnecessary-template-literal.ts` | `NoSubstitutionTemplateLiteral` | `codemod` | warning | 4 |
| 9 | `no-var` | `no-var.ts` | `no-var.ts` | `VariableDeclarationList` | **`auto-fix`** (RULE-026) | warning | 4 |
| 10 | `pascal-case-types` | `pascal-case-types.ts` | `pascal-case-types.ts` | `ClassDeclaration`, `InterfaceDeclaration`, `TypeAliasDeclaration`, `EnumDeclaration` | `manual` | warning | 3 |
| 11 | `prefer-array-methods` | `prefer-array-methods.ts` | `prefer-array-methods.ts` | `ForOfStatement`, `ForStatement` | `codemod` | warning | 5 |
| 12 | `prefer-optional-chain` | `prefer-optional-chain.ts` | `prefer-optional-chain.ts` | `BinaryExpression` | `codemod` | warning | 3 |
| 13 | `prefer-union-over-enum` | `prefer-union-over-enum.ts` | `prefer-union-over-enum.ts` | `EnumDeclaration` | `codemod` | warning | 3 |
| 14 | `triple-equals` | `triple-equals.ts` | `triple-equals.ts` | `BinaryExpression` | **`auto-fix`** (RULE-026) | warning | 7 |

Plus a category barrel test (`src/test/index.test.ts`, 6 tests) asserting the 14-rule
bundle, id uniqueness, the single `error`-severity rule, and the RULE-026 auto-fix
tally. **Total: 72 tests.**

META was ported **verbatim** (id / severity / category / tier / fixKind / tags /
recommendation) and the PREDICATE bodies were copied character-for-character (every
`ts.is*` guard, the exact conditions, 1-based `line + 1` / `column + 1`, message + help
text). The ONLY edit applied to each rule file was the import rewrite:
`import { defineRule } from "../../define-rule.js"` →
`import { defineRule } from "@ts-doctor/rules-core-effect"` (and likewise the
`import type { RuleContext }` in `no-array-constructor`, `pascal-case-types`,
`prefer-array-methods`).

---

## 2. Deviations from legacy (all consume-substrate / no behavior change)

This slice introduces **NO** behavioral deviations from the legacy rules. The
diagnostics emitted are byte-identical (same rule id, severity, tier, category, message,
help, 1-based position). What changed is purely structural:

- **D1 — Substrate is consumed, not vendored.** `defineRule` / `RuleContext` / `Rule` /
  `runRule` come from `@ts-doctor/rules-core-effect`; `Diagnostic` / `RuleMeta` come
  (transitively, through rules-core) from `@ts-doctor/contracts-effect`. The legacy rules
  imported a local `../../define-rule.js` and `../../test-utils.js` `runRule`. The
  rules-core `defineRule.ts` is a faithful port of the legacy `define-rule.ts` (identical
  `buildDiagnostic` shape, including the `exactOptionalPropertyTypes` conditional spreads
  that keep absent optionals ABSENT — so `fix` is genuinely missing, not `fix: undefined`).
- **D2 — Tests driven by the shared `runRule`.** Each `src/test/<rule>.test.ts` imports
  `runRule` from `@ts-doctor/rules-core-effect` (the SAME walk/dispatch driver the engine
  uses), not a vendored test util. The ported legacy vectors ARE the equivalence proof:
  passing them = behavioral equivalence with legacy.
- **D3 — Barrel hygiene.** `src/main/index.ts` re-exports the 14 rules by name +
  `namingIdiomsRules: ReadonlyArray<Rule>` and does **NOT** re-publish rules-core /
  contracts symbols it does not own (matches the rules-core / declaration-api convention).

### Equivalence proof
Every assertion in the 14 legacy `*.test.ts` files (snippet → expected diagnostic count
+ rule/severity/message spot-checks) was ported verbatim. Added on top: the documented
edge cases — `triple-equals` does NOT flag `== null` / `null == x` / `!= null` /
`!= undefined`; each of the 4 RULE-026 auto-fix rules fires but its diagnostic carries NO
`fix` (`expect(diags[0].fix).toBeUndefined()`); position assertions (1-based line/column)
on `consistent-type-definitions` and `no-inferrable-type-annotation`; per-kind message
labels for `pascal-case-types`; and the verbatim quirks (`no-array-constructor` allows a
unary-numeric length; `no-unnecessary-template-literal` leaves single-quote templates
alone; `prefer-union-over-enum` also flags a `const enum`; `no-namespace` flags
`module X {}`).

---

## 3. Preserved quirks (DO NOT "fix" without product sign-off)

- **RULE-026 — broken auto-fix (PRESERVED VERBATIM).** Four rules in this category —
  `no-const-enum`, `no-inferrable-type-annotation`, `no-var`, `triple-equals` — declare
  `fixKind: "auto-fix"` in their META but attach **no** `fix` payload when they report.
  (The 5th broken auto-fix rule from RULE-026, `prefer-error-instantiation`, lives in a
  different category and is out of scope here.) `triple-equals` even computes the
  replacement string (`===` / `!==`) but only embeds it in the MESSAGE — no `fix.edits`
  are produced. This is asserted per-rule (`fix` is `undefined`) and category-wide (the
  4-rule auto-fix tally in `index.test.ts`). **Preserved exactly; no fix payloads added.**
- **`triple-equals` allows `== null` / `!= null`.** The sanctioned loose-equality idiom
  for "null OR undefined" is NOT flagged (`comparesToNullish` short-circuits when either
  operand is the `null` keyword or the `undefined` identifier, on either side).
- **Conservative predicates kept as-is**, e.g. `consistent-type-definitions` only fires on
  a single non-empty `TypeLiteralNode` RHS (unions/intersections/mapped/function types are
  not flagged); `no-inferrable-type-annotation` matches only the bare keyword annotation
  (a literal-union annotation is not flagged); `no-array-constructor` allows the single
  numeric-literal length form; `prefer-array-methods` requires a single-statement push body
  (or `if`-without-`else` guarding a push).

---

## 4. What was NOT migrated (out of scope for this slice)

- **No engine wiring / registry codegen.** The category bundle is exported as
  `namingIdiomsRules`, but it is NOT yet added to the rules-core `ruleRegistry` (which is
  the v1 hand-written codegen seam, replaced when the full ~88-rule catalog lands). The
  engine drives these via `runRule` (Tier-1 walk/dispatch) once registered.
- **No capability-gating fields.** These SYN rules carry no `requires` / `disabledBy` /
  `defaultEnabled` — they are always-on, AST-only, and need no Tier-2 checker (BC-10).
- **No `runTypeAwareRule`.** That Tier-2 driver lands with the first TYP category; this
  is a pure Tier-1 category.
- **Legacy left untouched.** Nothing under `legacy/`, `rules-core`, or `contracts` was
  edited.

---

## 5. Follow-ups

1. **RULE-026 (P1, confirmed defect) — decide a resolution for the 4 broken auto-fix
   rules.** `no-const-enum`, `no-inferrable-type-annotation`, `no-var`, `triple-equals`
   advertise `fixKind: "auto-fix"` to the agent `fix && rescan` loop (the tool's core
   value prop) but produce zero edits, so `--fix` is a silent no-op for them. They SHOULD
   either (a) emit a real `fix` payload (each is a mechanically-trivial edit:
   strip `const`, drop the annotation, `var`→`let`/`const`, `==`→`===`), or (b) downgrade
   `fixKind` to `codemod` / `manual` so `--explain` / `--fix` stop lying. **Preserved
   as-is in this slice** to keep behavioral equivalence; the resolution is a product call.
   The tests pin the current (no-fix) behavior, so changing it will (correctly) require
   updating the RULE-026 assertions.
2. **Register the category** in the rules-core registry (or the codegen) so the engine
   activates these 14 rules. Currently exported but not wired.
3. **Threshold/tunability (RULE-025 SME question)** does not apply to this category —
   none of these 14 rules carry numeric budgets; they are pure token/AST shape predicates.
