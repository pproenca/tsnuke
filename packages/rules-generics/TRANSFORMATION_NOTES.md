# Transformation Notes — `generics` rule category → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform tsnuke rules-generics effect`.

Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/rules/generics/`
(+ the `Diagnostic`/`RuleMeta` contracts and the `defineRule`/`runRule`/`runTypeAwareRule`
substrate, now owned by `@tsnuke/contracts-effect` and `@tsnuke/rules-core-effect`
respectively).
Target: `modernized/rules-generics/effect/` (package `@tsnuke/rules-generics-effect`).

Implements the **Generics & Type-Level Complexity** category — **5 rules**, split
**4 SYN + 1 TYP**:

| Rule | Tier | Business rule |
|------|------|---------------|
| `generic-name-convention` | SYN | RULE-025 (generics row) |
| `generic-param-count-budget` | SYN | **RULE-007** (generic param count > 4, exclusive) |
| `no-generic-with-default-any` | SYN | RULE-025 (generics row) |
| `no-unnecessary-type-constraint` | SYN | RULE-025 (generics row) |
| `prefer-generic-over-any-passthrough` | **TYP** (`requires: ["typecheck:ok"]`) | RULE-025 (generics row) |

**Result:** 42/42 characterization tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · both `file:` deps
(`rules-core-effect`, `contracts-effect`) link and resolve · **first slice to exercise
`runTypeAwareRule`** (the Tier-2 checker-carrying driver) for its TYP rule.

---

## 1. Mapping table (legacy rule file → target)

| Legacy source (`…/rules/generics/`) | Target (`src/main/`) | Tier |
|-------------------------------------|----------------------|------|
| `generic-name-convention.ts` | `generic-name-convention.ts` | SYN |
| `generic-param-count-budget.ts` | `generic-param-count-budget.ts` | SYN |
| `no-generic-with-default-any.ts` | `no-generic-with-default-any.ts` | SYN |
| `no-unnecessary-type-constraint.ts` | `no-unnecessary-type-constraint.ts` | SYN |
| `prefer-generic-over-any-passthrough.ts` | `prefer-generic-over-any-passthrough.ts` | TYP |
| category barrel + `genericsRules` registry | `src/main/index.ts` | — (v1 manual codegen seam) |
| `runRule` / `runTypeAwareRule` test drivers (legacy `test-utils.ts`) | imported from `@tsnuke/rules-core-effect` (not vendored) | — |
| legacy `*.test.ts` vectors (the behavioral spec) | ported into `src/test/*.test.ts` | — |

Each predicate was ported **VERBATIM** — same META (id / severity / category / tier /
fixKind / tags / recommendation, plus `requires: ["typecheck:ok"]` on the TYP rule);
same `ts.is*` guards; same threshold (`GENERIC_PARAM_THRESHOLD = 4`, **exclusive** `>`);
same 5 declaration kinds for the param-count budget (FunctionDeclaration /
MethodDeclaration / ClassDeclaration / InterfaceDeclaration / TypeAliasDeclaration);
same `getLineAndCharacterOfPosition` + `+1` 1-based position; same `report` message /
help text. The diagnostic construction itself (auto-fill of `plugin` / `rule` / `tier` /
`category` / `severity` from meta) is unchanged — the same `createRuleContext` /
`buildDiagnostic` path, now living in `rules-core-effect`.

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** The predicates are byte-for-byte the legacy logic. The only changes
are structural / dependency-routing:

### D1 — Import the substrate, do NOT re-vendor it
- `defineRule` (and the `Rule` / `RuleContext` types) are imported from
  `@tsnuke/rules-core-effect` instead of the legacy relative `../../define-rule.js`.
- `runRule` (the SYN AST driver) **and** `runTypeAwareRule` (the TYP checker driver) —
  both legacy `test-utils.ts` — are imported from `@tsnuke/rules-core-effect` in the
  tests. The engine drives these rules through the *same* walk/dispatch (SYN) and the
  *same* one-file `ts.Program` + `ts.TypeChecker` (TYP), so the tests exercise the real
  production drivers, not copies.
- `Diagnostic` / `RuleMeta` come from `@tsnuke/contracts-effect` transitively (rules
  never name them directly here; they flow through `defineRule`/`ctx.report`). This slice
  does not re-vendor any contract or substrate symbol.

### D2 — Two `file:` deps + double inline (consumption pattern)
`package.json` adds `@tsnuke/rules-core-effect` **and** `@tsnuke/contracts-effect`
as `file:` deps, plus `typescript` as a real **dependency** (not devDependency): the rules
call `ts.SyntaxKind` / `ts.is*` / `getLineAndCharacterOfPosition` / the `TypeChecker` API
at **runtime**, so the compiler API is a production dependency, not a build-only tool.
`vitest.config.ts` inlines **both** packages (`server.deps.inline`) because each is a
`.ts`-entry `file:` link, and rules-core itself imports contracts — same pattern the
type-performance slice uses for `rules-core` + contracts.

### D3 — Barrel hygiene (no symbol re-publishing)
`src/main/index.ts` exports only what this slice owns: the five rules (by stable name) and
`genericsRules: ReadonlyArray<Rule>`. It does **not** re-export `defineRule` / `runRule` /
`runTypeAwareRule` / `Diagnostic` / `RuleMeta` — consumers import those from their owning
packages (mirrors rules-core's own barrel discipline).

### D4 — TYP rule's checker gate preserved verbatim
`prefer-generic-over-any-passthrough` keeps the legacy `if (ctx.checker === undefined)
return;` early-return at the top of its visitor. Under the SYN `runRule` driver (no
checker) the rule emits nothing; under `runTypeAwareRule` (`ctx.checker` present) it fires.
The "emits nothing without a checker (gated)" legacy vector — run through `runRule` — is
the direct proof of this gate (BC-10: Tier-2 rules are inert on the broken-project path).

---

## 3. Equivalence strategy (the proof)

**Characterization-test TDD.** The legacy `*.test.ts` cases ARE the behavioral spec, so
every legacy vector was ported first, then the (verbatim) implementation made to pass them:

- **Ported legacy vectors** (the equivalence proof): every legacy snippet + assertion,
  unchanged — lowercase vs PascalCase type-param names; `<A,B,C,D,E>` over-budget function
  / interface and the under-budget `<A,B>`; `<T = any>` vs `<T = unknown>`; `<T extends any>`
  / `<T extends unknown>` vs `<T extends string>`; the TYP identity / inferred-any-arrow /
  `o.value` derivation / already-generic / non-any-return / no-checker-gate cases. Passing
  them = behaviorally identical to legacy.
- **Added boundary cases (RULE-007 off-by-one):** exactly **4** type parameters → does NOT
  fire; **5** → fires (the exclusive `>` budget pinned on both sides). Plus the
  no-type-params and full message/budget-text assertions.
- **Added scoping cases (RULE-007 edge):** arrow functions and function expressions with
  > 4 type parameters do **NOT** fire — only the 5 named declaration kinds are covered.
  Coverage test asserts all 5 kinds DO fire.
- **Added scoping for the TYP rule:** a no-passthrough body (`return 1`), a no-`any`-param
  function, an `any` passthrough **method** (DOES fire), and a return-from-nested-function
  (does NOT fire — nested returns aren't the outer fn's). Plus the gated-without-checker
  case via `runRule`.
- **Added full-shape assertions:** every diagnostic's 1-based `line` / `column`, `message`,
  `help`, `severity`, `tier`, `category`, `plugin`, and `rule` id are asserted (the legacy
  tests asserted only a subset). Positions verified against the real driver output (e.g.
  type-parameter diagnostics pin to col 12 for `function f<T …>`; declaration-level
  diagnostics pin to col 1).

**42 tests total** across the 5 rules. SYN rules driven through the real `runRule`; the TYP
rule through the real `runTypeAwareRule` (one-file `ts.Program` + live `ts.TypeChecker`,
real default lib) — the same paths the engine uses — so equivalence holds for the
production path, not a test-only harness.

---

## 4. What was NOT migrated (and why)

- **The predicates stayed plain, synchronous AST visitors — NOT `Effect`-wrapped.**
  Deliberate and consistent with the substrate: rule visitors are pure sync callbacks over
  an in-memory `ts.forEachChild` walk (the TYP rule additionally reads a synchronous
  `ts.TypeChecker`); a fiber buys nothing. Effect appears only in the contract layer
  (`Diagnostic` / `RuleMeta` are `effect/Schema` in contracts), never in these predicates.
- **The substrate + contracts** (`defineRule` / `runRule` / `runTypeAwareRule` /
  `Diagnostic` / `RuleMeta`) were NOT copied — they are consumed read-only from their
  owning packages (see D1).
- **No dead code** in the five legacy rule files — every line is live, so nothing dropped.

---

## 5. Follow-ups

1. **Engine drives SYN via `runRule`'s walk + TYP via the checker path.** No bespoke driver
   is needed: the engine walks each file and dispatches by `SyntaxKind` exactly like
   `runRule` (one parse, walk, dispatch) for the 4 SYN rules, and supplies `ctx.checker` on
   the `typecheck:ok` path for `prefer-generic-over-any-passthrough` exactly like
   `runTypeAwareRule`. When the full catalog lands, `genericsRules` folds into the global
   `ruleRegistry` (the hand-written list is the v1 codegen seam; legacy
   `scripts/generate-rule-registry.mjs` will replace both manual lists).
2. **RULE-007 threshold tunability (RULE-025 open question).** `GENERIC_PARAM_THRESHOLD = 4`
   is hardcoded. RULE-025's SME question (BUSINESS_RULES.md §"SME questions" #5) is
   unresolved: *are the budgets — `any` density 5, generic params 4, union 12,
   intersection 5, object 12 — deliberate, validated product policy or placeholder
   defaults?* This decides whether the generic-param budget becomes user-tunable config in
   the rewrite. Until answered, it stays a hardcoded constant (legacy parity).
3. **Category registry shape.** `genericsRules` is `ReadonlyArray<Rule>`; if the global
   codegen prefers a keyed map (`Record<id, Rule>`) the array can be folded with
   `Object.fromEntries(rules.map(r => [r.id, r]))` at the registry seam — no rule change.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** follows the established slice convention (score /
  rules-core / type-performance), honored as written for consistency.
- **`typescript` is a runtime `dependency`**, not a devDependency (the rules use the
  compiler API — including the `TypeChecker` for the TYP rule — at runtime).
- **Run:** `cd modernized/rules-generics/effect && pnpm test` (vitest) ·
  `pnpm typecheck` (tsc). Both green: 42/42 · tsc exit 0.
