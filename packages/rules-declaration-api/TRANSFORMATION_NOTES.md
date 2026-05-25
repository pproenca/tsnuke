# Transformation Notes — `declaration-api` rule category → Effect-native substrate

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-fix declaration-api effect`.

Source (READ-ONLY): `legacy/ts-fix/packages/ts-fix-rules/src/rules/declaration-api/`
(4 SYN rules + their colocated `*.test.ts`).
Target: `modernized/rules-declaration-api/effect/` — package `@ts-fix/rules-declaration-api-effect`.

This is the FIRST SYN AST rule-category slice on the Effect-native rule substrate. It is a
**true strangler-fig**: it CONSUMES the already-completed substrate
(`@ts-fix/rules-core-effect` for `defineRule` / `runRule` / `Rule` / `RuleContext`) and the
canonical data contracts (`@ts-fix/contracts-effect` for `Diagnostic` / `RuleMeta`, reached
transitively through rules-core). Neither dependency was modified — nor was `legacy/`.

Implements the `declaration-api` slice of **RULE-025** (per-rule detection predicates by
category). Each rule is a pure `ts.SyntaxKind → visitor` map built with `defineRule`; the engine
drives them via rules-core's shared `runRule` walk/dispatch (one parse, walk, dispatch by kind).

**Result:** 46/46 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.

**`file:` dependency imports:** both `file:../../rules-core/effect`
(`@ts-fix/rules-core-effect`) and `file:../../contracts/effect`
(`@ts-fix/contracts-effect`) import cleanly via package name. `typescript` is a real runtime
DEPENDENCY (the rules call the compiler API at runtime — `ts.is*`, `ts.getModifiers`,
`ts.SyntaxKind`), not a devDependency. Vitest transpiles the two `.ts`-entry `file:` deps at test
time via `vitest.config.ts → test.server.deps.inline: ["@ts-fix/rules-core-effect",
"@ts-fix/contracts-effect"]` (contracts must be inlined too because rules-core imports it).
No relative-import fallback was needed.

---

## 1. Mapping table (legacy → target)

| Rule (id) | Legacy source | Target | Visitor `SyntaxKind`(s) |
|-----------|---------------|--------|--------------------------|
| `explicit-member-accessibility` | `declaration-api/explicit-member-accessibility.ts` | `src/main/explicit-member-accessibility.ts` | `PropertyDeclaration`, `MethodDeclaration`, `GetAccessor`, `SetAccessor` |
| `explicit-module-boundary-types` | `declaration-api/explicit-module-boundary-types.ts` | `src/main/explicit-module-boundary-types.ts` | `FunctionDeclaration` |
| `no-export-assignment` | `declaration-api/no-export-assignment.ts` | `src/main/no-export-assignment.ts` | `ExportAssignment` |
| `no-mutable-exports` | `declaration-api/no-mutable-exports.ts` | `src/main/no-mutable-exports.ts` | `VariableStatement` |

META (id / severity / category / tier / fixKind / tags / recommendation) and the predicate body
(the exact `ts.is*` guards, conditions, 1-based line/column, message/help strings) were ported
**verbatim**. The ONLY change to each rule file is the import line: `defineRule` (and the
`RuleContext` type, for `explicit-member-accessibility`) now come from
`@ts-fix/rules-core-effect` instead of the legacy relative `../../define-rule.js`.

### Predicate / edge-case preservation (per rule)

- **explicit-member-accessibility** — fires only when the member's `parent` is a
  `ClassDeclaration` *or* `ClassExpression` (object-literal methods exempt); exempts members
  carrying any of `public`/`private`/`protected`; uses the member name in the message when it's an
  identifier, else the literal `"member"`. Covers exactly the 4 member kinds above (constructors /
  parameter-properties / index signatures NOT covered).
- **explicit-module-boundary-types** — `FunctionDeclaration` only; requires the `export` modifier;
  exempt when `node.type !== undefined` (return type annotated). Arrow-fn / method / non-exported
  functions are out of scope by construction.
- **no-export-assignment** — `ExportAssignment` with `isExportEquals === true` (`export = …`);
  `export default …` is exempt.
- **no-mutable-exports** — exported `VariableStatement` whose `declarationList.flags` lacks
  `ts.NodeFlags.Const` (`export let` / `export var`); `export const` exempt; non-exported bindings
  exempt.

## 2. Barrel (`src/main/index.ts`)

Exports each rule by stable name (`explicitMemberAccessibility`, `explicitModuleBoundaryTypes`,
`noExportAssignment`, `noMutableExports`) plus `declarationApiRules: ReadonlyArray<Rule>` (the
codegen/registry seam). Per barrel hygiene it re-exports NO rules-core/contracts symbols it does
not own (`Rule` is imported as a `type` only, to annotate the array).

## 3. Equivalence proof (characterization tests)

`src/test/` drives every rule through rules-core's `runRule` (the same walk/dispatch the engine
uses). The legacy `*.test.ts` vectors (snippet → expected diagnostic count / rule id) were ported
**verbatim** — those vectors ARE the legacy behavior, so passing them IS the equivalence proof.
Each suite then ADDS edge cases the predicate's logic implies: covered-vs-exempted node kinds,
verbatim message/help assertions, full-meta carry (plugin/severity/category/tier), and 1-based
position assertions. 46 tests total (10 ported from legacy + 32 added edge cases + 4 barrel).

| Suite | Ported (legacy) | Added | Total |
|-------|-----------------|-------|-------|
| explicit-member-accessibility | 4 | 10 | 14 |
| explicit-module-boundary-types | 3 | 8 | 11 |
| no-export-assignment | 2 | 5 | 7 |
| no-mutable-exports | 3 | 7 | 10 |
| index (barrel) | — | 4 | 4 |

## 4. Deviations

- **No vendored substrate / contracts.** This slice CONSUMES `@ts-fix/rules-core-effect`
  (`defineRule`, `runRule`, `Rule`, `RuleContext`) and `@ts-fix/contracts-effect`
  (`Diagnostic`, `RuleMeta`, reached transitively) rather than re-declaring any of them. Legacy
  imported `defineRule`/`runRule` from sibling files within one package; here they cross the
  package boundary by name.
- **One column expectation corrected in a NEWLY-ADDED edge test (not a ported legacy vector).**
  The legacy `explicit-member-accessibility.test.ts` asserts only `toHaveLength` — it has NO column
  assertion. The 10→11 fix was in an edge-case test THIS slice added; the rule source is legacy
  verbatim and independently emits column 11 (`x` at 0-based char 10 ⇒ 1-based 11). So no legacy
  vector was altered and nothing was masked — the hand-count in our own new test was corrected to
  the rule's true (legacy-verbatim) output. (Architecture review explicitly adjudicated this as
  legacy-correct.)
- **No behavioral change.** Predicates, meta, messages, and positions are byte-for-byte the legacy
  logic. The rules are plain-TS AST predicates (NOT Effect-wrapped) — a fiber buys nothing for a
  synchronous `ts.forEachChild` walk, consistent with the substrate's design note in
  `rules-core/effect/src/main/defineRule.ts`.

## 5. Follow-ups

- **SYN tier only.** All 4 rules are Tier-1 syntactic (AST-only, no `ts.TypeChecker`). The
  type-aware driver `runTypeAwareRule` is intentionally NOT consumed here; it lands with the first
  TYP rule-category slice (where it has a consumer), per the note in `rules-core/.../runRule.ts`.
- **Engine drives via `runRule`.** These rules expose `create(ctx)` visitor maps; the engine
  walks/dispatches them exactly as `runRule` does. The hand-written `ruleRegistry` in rules-core
  is the v1 codegen seam — `declarationApiRules` is the registry-ready array for when the codegen
  (legacy `scripts/generate-rule-registry.mjs`, RULE-025) wires the full catalog.
- **`fixKind: "manual"`** on all 4 rules — no auto-fix payload is emitted (correct: these are
  advisory; not among the 5 RULE-026 mislabeled auto-fix rules, which live in other categories).
