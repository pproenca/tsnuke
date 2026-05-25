# Transformation Notes — `error-handling` rule category → Effect-native substrate

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor error-handling effect`.

Source (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor-rules/src/rules/error-handling/`
(8 rules — 6 SYN + 2 TYP — plus their colocated `*.test.ts`).
Target: `modernized/rules-error-handling/effect/` — package `@ts-doctor/rules-error-handling-effect`.

This is the FIRST rule-category slice on the Effect-native rule substrate to mix the SYN and
TYP (type-aware) tiers. It is a **true strangler-fig**: it CONSUMES the already-completed
substrate (`@ts-doctor/rules-core-effect` for `defineRule` / `runRule` / `runTypeAwareRule` /
`Rule` / `RuleContext`) and the canonical data contracts (`@ts-doctor/contracts-effect` for
`Diagnostic` / `RuleMeta`, reached transitively through rules-core). Neither dependency was
modified — nor was `legacy/`. Same two-`file:`-dep + inline + `typescript`-runtime config
structure as the completed `declaration-api` sibling.

Implements the `error-handling` slice of **RULE-025** (per-rule detection predicates by
category). Each rule is a pure `ts.SyntaxKind → visitor` map built with `defineRule`; the engine
drives SYN rules via `runRule` (one parse, walk, dispatch by kind) and TYP rules via
`runTypeAwareRule` (one-file `ts.Program` + live `ts.TypeChecker`).

**Result:** 75/75 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.

**`file:` dependency imports + `runTypeAwareRule`:** both `file:../../rules-core/effect`
(`@ts-doctor/rules-core-effect`) and `file:../../contracts/effect` (`@ts-doctor/contracts-effect`)
import cleanly by package name. `typescript` is a real runtime DEPENDENCY (the rules call the
compiler API at runtime — `ts.is*`, `ts.TypeFlags`, `checker.getTypeAtLocation` /
`checker.typeToString`), not a devDependency. Vitest transpiles the two `.ts`-entry `file:` deps
at test time via `vitest.config.ts → test.server.deps.inline: ["@ts-doctor/rules-core-effect",
"@ts-doctor/contracts-effect"]` (contracts must be inlined too because rules-core imports it).
`runTypeAwareRule` (the TYP driver) was consumed for the first time by a category slice here —
it builds the real default lib, so the checker resolves `Promise`, `Error` subclasses, and
literal types correctly. No relative-import fallback was needed.

---

## 1. Mapping table (legacy → target)

| Rule (id) | Tier | Legacy source | Target | Visitor `SyntaxKind`(s) |
|-----------|------|---------------|--------|--------------------------|
| `no-empty-catch` | SYN | `error-handling/no-empty-catch.ts` | `src/main/no-empty-catch.ts` | `CatchClause` |
| `no-error-message-matching` | SYN | `error-handling/no-error-message-matching.ts` | `src/main/no-error-message-matching.ts` | `CallExpression` |
| `no-ex-assign` | SYN | `error-handling/no-ex-assign.ts` | `src/main/no-ex-assign.ts` | `CatchClause` |
| `no-throw-in-finally` | SYN | `error-handling/no-throw-in-finally.ts` | `src/main/no-throw-in-finally.ts` | `TryStatement` |
| `no-useless-catch` | SYN | `error-handling/no-useless-catch.ts` | `src/main/no-useless-catch.ts` | `CatchClause` |
| `prefer-error-instantiation` | SYN | `error-handling/prefer-error-instantiation.ts` | `src/main/prefer-error-instantiation.ts` | `CallExpression` |
| `only-throw-error` | TYP | `error-handling/only-throw-error.ts` | `src/main/only-throw-error.ts` | `ThrowStatement` |
| `prefer-promise-reject-errors` | TYP | `error-handling/prefer-promise-reject-errors.ts` | `src/main/prefer-promise-reject-errors.ts` | `CallExpression` |

META (id / severity / category / tier / requires / fixKind / tags / recommendation) and the
predicate body (the exact `ts.is*` guards, helper functions, `ts.TypeFlags` masks, 1-based
line/column, message/help strings) were ported **verbatim**. The ONLY change to each rule file
is the import line: `defineRule` (and the `RuleContext` type, for `no-throw-in-finally`) now come
from `@ts-doctor/rules-core-effect` instead of the legacy relative `../../define-rule.js`.

### Predicate / edge-case preservation (per rule)

- **no-empty-catch** — `CatchClause` with zero statements AND a block whose whitespace-stripped
  text is exactly `{}` (a comment-only catch is exempt — it documents the intentional swallow).
- **no-error-message-matching** — a `CallExpression` whose callee is a property access named one
  of `test`/`includes`/`startsWith`/`endsWith`/`match`/`search`, where the receiver or any arg
  `looksLikeErrorMessage` (a `.message` access, an `e`/`err`/`error`/`message`/`msg` identifier,
  or `String(...)` wrapping one). Plain-string `.includes` is exempt.
- **no-ex-assign** — `CatchClause` with an identifier binding; recursively scans the block for a
  binary assignment (`=` OR any compound/logical-assignment token in the
  `FirstCompoundAssignment..LastCompoundAssignment` range) whose left is that identifier.
  Severity `error`.
- **no-throw-in-finally** — `TryStatement` with a `finallyBlock`; scans each finally statement
  recursively for a `throw`/`return`, STOPPING at nested function scopes (function decl/expr,
  arrow, method) — a throw inside a closure declared in `finally` is the closure's, not the
  finally completion's.
- **no-useless-catch** — `CatchClause` with an identifier binding whose body is exactly one
  `throw <sameIdentifier>;` statement. A catch that does more, wraps the error, or rethrows a
  different identifier is exempt.
- **prefer-error-instantiation** — `CallExpression` with a bare-identifier callee whose name
  passes the `isErrorCtorName` heuristic. Property-access callees (`obj.Error(...)`) and `new`
  expressions are exempt by construction. **RULE-026 + RULE-017 preserved** — see §4.
- **only-throw-error** (TYP) — early-returns when `ctx.checker === undefined`; flags a
  `ThrowStatement` whose `getTypeAtLocation(expression).flags` intersect
  `StringLike | NumberLike | BooleanLike`. Message embeds `checker.typeToString(type)`.
- **prefer-promise-reject-errors** (TYP) — early-returns when `ctx.checker === undefined`; flags a
  `Promise.reject(...)` static call (`isPromiseReject`) whose first arg's type intersects the same
  primitive mask. No-arg `Promise.reject()` and non-`Promise` `.reject(...)` are exempt.

## 2. Barrel (`src/main/index.ts`)

Exports each rule by stable name (`noEmptyCatch`, `noErrorMessageMatching`, `noExAssign`,
`noThrowInFinally`, `noUselessCatch`, `preferErrorInstantiation`, `onlyThrowError`,
`preferPromiseRejectErrors`) plus `errorHandlingRules: ReadonlyArray<Rule>` (8 rules, the
codegen/registry seam — SYN first, then TYP). Per barrel hygiene it re-exports NO
rules-core/contracts symbols it does not own (`Rule` is imported as a `type` only, to annotate
the array).

## 3. Equivalence proof (characterization tests)

`src/test/` drives SYN rules through rules-core's `runRule` and TYP rules through
`runTypeAwareRule` (the same walk/dispatch the engine uses). The legacy `*.test.ts` vectors
(snippet → expected diagnostic count / rule id / tier) were ported **verbatim** — those vectors
ARE the legacy behavior, so passing them IS the equivalence proof. Each suite then ADDS edge
cases the predicate's logic implies, plus the required additions: the RULE-026 no-fix assertion,
the RULE-017 `*Error` heuristic boundary, catch/finally negatives, and
position/message/severity/rule-id carry. 75 tests total.

| Suite | Ported (legacy) | Added | Total |
|-------|-----------------|-------|-------|
| no-empty-catch | 3 | 3 | 6 |
| no-error-message-matching | 4 | 4 | 8 |
| no-ex-assign | 2 | 6 | 8 |
| no-throw-in-finally | 4 | 5 | 9 |
| no-useless-catch | 3 | 4 | 7 |
| prefer-error-instantiation | 5 | 9 | 14 |
| only-throw-error | 3 | 5 | 8 |
| prefer-promise-reject-errors | 3 | 4 | 7 |
| index (barrel) | — | 8 | 8 |

### RULE-026 preservation (prefer-error-instantiation)

`prefer-error-instantiation` is the 5th of the RULE-026 broken auto-fix rules: its META declares
`fixKind: "auto-fix"` but it attaches NO `fix` payload to its diagnostic, so `--fix` is a silent
no-op for it. **This is preserved VERBATIM** — no `fix` was added. Two tests pin it: one asserts
`rule.fixKind === "auto-fix"`, the other asserts the emitted diagnostic has NO `fix` (both
`diags[0].fix === undefined` AND `hasOwnProperty("fix") === false`, since the substrate's
`buildDiagnostic` omits the key entirely under `exactOptionalPropertyTypes` rather than setting
`fix: undefined`). The barrel test additionally confirms it is the ONLY auto-fix-declared rule in
this category.

### RULE-017 preservation (the `*Error` name heuristic)

`isErrorCtorName(name) = name === "Error" || (name.length > 5 && name.endsWith("Error"))` ported
verbatim. Boundary tests: bare `Error` is flagged (literal branch); a >5-char `*Error` name
(`HttpError`, `XxError`) is treated as an error ctor (suffix branch); a short non-`Error` name
(`Erro`, `Range`) is NOT flagged. The `length > 5` clause only excludes the bare word from the
suffix branch — the literal branch still catches `Error` itself.

## 4. Deviations

- **No vendored substrate / contracts.** This slice CONSUMES `@ts-doctor/rules-core-effect`
  (`defineRule`, `runRule`, `runTypeAwareRule`, `Rule`, `RuleContext`) and
  `@ts-doctor/contracts-effect` (`Diagnostic`, `RuleMeta`, reached transitively) rather than
  re-declaring any of them. Legacy imported `defineRule`/`runRule` from sibling files within one
  package; here they cross the package boundary by name. Equivalence = the ported legacy test
  vectors, which all pass unmodified.
- **Five expected-value corrections in NEWLY-ADDED edge tests (not ported legacy vectors).** My
  initial hand-counted columns and hand-written TYP messages were wrong; the rule sources are
  legacy-verbatim and emit the true values, which the corrected edge tests now assert:
  - catch-clause column is 14 (not 13) for `try { f(); } catch ...` — `try { f(); } ` is 13 chars.
  - `prefer-error-instantiation` column is 22 (not 21) for `function f() { throw Error('x'); }`.
  - TYP messages embed `checker.typeToString(type)`, which for a string-literal throw/reject is
    the LITERAL type (`"boom"`), not the widened `string`. No legacy vector was altered; the
    hand-counts in our own new tests were corrected to the rule's true (legacy-verbatim) output.
- **No behavioral change.** Predicates, meta, messages, `ts.TypeFlags` masks, and positions are
  byte-for-byte the legacy logic. The rules are plain-TS AST predicates (NOT Effect-wrapped) — a
  fiber buys nothing for a synchronous `ts.forEachChild` walk, consistent with the substrate's
  design note in `rules-core/effect/src/main/defineRule.ts`.

## 5. Follow-ups

- **RULE-026 (P1, confirmed defect — preserved as-is): `prefer-error-instantiation` should emit a
  fix or downgrade its `fixKind`.** It advertises `auto-fix` to the agent `fix && rescan` loop
  (the tool's core value prop) but produces zero edits. Resolution is an SME/product decision:
  either emit the `fix` payload (a `new ` insertion at the callee start) or downgrade `fixKind`
  to `codemod`/`manual` so `--explain`/`--fix` stop lying. Carried forward unchanged here.
- **RULE-017 (P2, SME question): is the `*Error` naming convention the intended detection
  contract, or should `prefer-error-instantiation` resolve actual `Error` subtypes via the type
  checker?** The current code deliberately uses naming to keep false positives near zero (a SYN
  rule with no checker). Open question per `BUSINESS_RULES.md` SME #3.
- **The 2 TYP rules are gated on `typecheck:ok` (RULE-018).** `only-throw-error` and
  `prefer-promise-reject-errors` declare `requires: ["typecheck:ok"]` and early-return when
  `ctx.checker === undefined`, so they produce nothing on the Tier-1 / broken-project path. The
  engine activates them only when Tier-2 is open; the characterization suite exercises both the
  checker-present (`runTypeAwareRule`) and checker-absent (`runRule` ⇒ empty) paths.
- **Engine drives via `runRule` / `runTypeAwareRule`.** These rules expose `create(ctx)` visitor
  maps; the engine walks/dispatches them exactly as the two drivers do. The hand-written
  `ruleRegistry` in rules-core is the v1 codegen seam — `errorHandlingRules` is the registry-ready
  array for when the codegen (legacy `scripts/generate-rule-registry.mjs`, RULE-025) wires the
  full catalog.
