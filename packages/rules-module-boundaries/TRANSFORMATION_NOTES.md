# Transformation Notes — `module-boundaries` rule category → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform tsnuke rules-module-boundaries effect`.

Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/rules/module-boundaries/`
(+ the `Diagnostic`/`RuleMeta` contracts and the `defineRule`/`runRule` substrate, now
owned by `@tsnuke/contracts-effect` and `@tsnuke/rules-core-effect` respectively).
Target: `modernized/rules-module-boundaries/effect/` (package
`@tsnuke/rules-module-boundaries-effect`).

Implements the category's **3 SYN rules**: **RULE-011** (`no-deep-relative-import` —
deep relative import with `>= 4` LEADING `..` segments), `no-default-export`, and
`public-api-must-be-explicit`. All three are Tier-1 **SYN** (AST-only) pure predicates.

The category's fourth rule, `no-import-cycles` (tier **GRAPH**), is **DEFERRED** — see §4.

**Result:** 26/26 characterization tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · both `file:` deps
(`rules-core-effect`, `contracts-effect`) link and resolve.

---

## 1. Mapping table (legacy rule file → target)

| Rule | Business rule | Legacy source | Target |
|------|---------------|---------------|--------|
| `no-deep-relative-import` | RULE-011 (deep relative import, `>= 4` leading `..`, INCLUSIVE) | `…/module-boundaries/no-deep-relative-import.ts` | `src/main/no-deep-relative-import.ts` |
| `no-default-export` | RULE-025 (module-boundaries row) | `…/module-boundaries/no-default-export.ts` | `src/main/no-default-export.ts` |
| `public-api-must-be-explicit` | RULE-025 (module-boundaries row) | `…/module-boundaries/public-api-must-be-explicit.ts` | `src/main/public-api-must-be-explicit.ts` |
| category barrel + `moduleBoundariesRules` registry | — (v1 manual codegen seam) | (codegen would fold into the global registry) | `src/main/index.ts` |
| `runRule` test driver | legacy `tsnuke-rules/src/test-utils.ts` | imported from `@tsnuke/rules-core-effect` (not vendored) | `src/test/*.test.ts` |
| legacy `*.test.ts` vectors | the behavioral spec | `…/module-boundaries/*.test.ts` | ported into `src/test/*.test.ts` |
| `no-import-cycles` | RULE-015 (cycle detection, GRAPH) | `…/module-boundaries/no-import-cycles.ts` | **NOT migrated — deferred (§4)** |

Each predicate was ported **VERBATIM** — same META (id / severity / category =
`"Module Boundaries & Architecture"` / tier `SYN` / fixKind `manual` / tags
`["architecture"]` / recommendation), same `ts.is*` guards, same detection logic, same
`getLineAndCharacterOfPosition` + `+1` 1-based position, same report message / help text.
The diagnostic-construction itself (auto-fill of `plugin` / `rule` / `tier` / `category` /
`severity` from meta) is unchanged — it is the same `createRuleContext` / `buildDiagnostic`
path, now living in `rules-core-effect`.

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** The predicates are byte-for-byte the legacy logic. The only changes
are structural / dependency-routing:

### D1 — Import the substrate, do NOT re-vendor it
- `defineRule` (and the `RuleContext` type, used by `no-deep-relative-import` and
  `no-default-export` for their helper signatures) is imported from
  `@tsnuke/rules-core-effect` instead of the legacy relative `../../define-rule.js`.
- `runRule` (the SYN AST driver, legacy `test-utils.ts`) is imported from
  `@tsnuke/rules-core-effect` in the tests — the engine drives these rules through the
  *same* walk/dispatch, so the tests exercise the real production driver, not a copy.
- `Diagnostic` / `RuleMeta` come from `@tsnuke/contracts-effect` transitively (rules
  never name them directly here; they flow through `defineRule`/`ctx.report`). This slice
  does not re-vendor any contract or substrate symbol.

### D2 — Two `file:` deps + double inline (consumption pattern)
`package.json` adds `@tsnuke/rules-core-effect` **and** `@tsnuke/contracts-effect`
as `file:` deps, plus `typescript` as a real **dependency** (not devDependency): the rules
call `ts.SyntaxKind` / `ts.is*` / `getLineAndCharacterOfPosition` at **runtime**, so the
compiler API is a production dependency, not a build-only tool. `vitest.config.ts` inlines
**both** packages (`server.deps.inline`) because each is a `.ts`-entry `file:` link, and
rules-core itself imports contracts — same pattern the type-performance slice uses.

### D3 — Barrel hygiene (no symbol re-publishing)
`src/main/index.ts` exports only what this slice owns: the three rules (by stable name) and
`moduleBoundariesRules: ReadonlyArray<Rule>`. It does **not** re-export `defineRule` /
`runRule` / `Diagnostic` / `RuleMeta` — consumers import those from their owning packages
(mirrors rules-core's own barrel discipline of not re-publishing contracts symbols).

### D4 — RULE-011's INCLUSIVE `>= 4` boundary (vs the budget rules' EXCLUSIVE `> N`)
The single behavioral subtlety worth flagging. RULE-011's `MAX_RELATIVE_DEPTH = 4` is an
**inclusive** floor: the rule fires when `depth >= MAX_RELATIVE_DEPTH` (the legacy guard is
`if (depth < MAX_RELATIVE_DEPTH) return;`). This is **distinct** from the type-performance
budget rules (RULE-008/009/010) which use the **exclusive** `> N` — there, *exactly* the
threshold does NOT fire; here, *exactly 4* leading `..` DOES fire. Preserved verbatim and
asserted on both sides of the boundary (exactly 3 → 0 diags, exactly 4 → 1 diag). Documented
inline at the constant in `no-deep-relative-import.ts`.

Two further RULE-011 edges are preserved and pinned by tests:
- **Only LEADING `..` count** — the scan breaks at the first non-`..` segment, so a mid-path
  climb (`a/../../../../deep`) counts as depth 0 and does NOT fire.
- **Non-string specifiers skipped** — `if (!ts.isStringLiteral(moduleSpecifier)) return;`
  (and non-relative bare imports like `@app/...` / `typescript` simply have no leading `..`).

---

## 3. Equivalence strategy (the proof)

**Characterization-test TDD.** The legacy `*.test.ts` cases ARE the behavioral spec, so
every legacy vector was ported first, then the implementation made to pass them:

- **Ported legacy vectors** (the equivalence proof), unchanged:
  - `no-deep-relative-import`: deep climb `../../../../deep/mod` fires; shallow `../sibling`
    does not.
  - `no-default-export`: `export default 42` fires; `export default function f(){}` fires;
    `export const x = 1` does not.
  - `public-api-must-be-explicit`: `export * from "./mod"` fires; `export { a, b } from
    "./mod"` does not.
- **Added RULE-011 boundary cases (the brief's explicit asks):**
  - exactly **3** `..` does NOT fire; exactly **4** DOES (the inclusive `>= 4` boundary);
    5 fires and reports `(5 levels)`.
  - a **mid-path `..`** after a non-`..` segment (`a/../../../../deep`) is NOT counted.
  - **non-relative imports** (`@app/deep/mod`, `typescript`) are ignored.
  - the rule also covers **`export … from`** re-export declarations (deep fires, shallow not).
- **Added edge cases per rule:**
  - `no-default-export`: `export default class` fires (modifier form); `export = 42`
    (export-equals) does NOT fire; named exported function/class and a non-exported function
    do NOT fire.
  - `public-api-must-be-explicit`: namespaced `export * as ns from "…"` (has an exportClause)
    does NOT fire; a local named export (no module specifier) does NOT fire; a plain import
    does NOT fire.
- **Added full-shape assertions:** every diagnostic's 1-based `line` / `column`, `message`,
  `help`, `severity`, `tier`, `category`, `plugin`, and `rule` id are asserted (the legacy
  tests asserted only `rule` and length).

**26 tests total** (11 deep-relative + 9 default-export + 6 public-api). Driven through the
real `runRule` from rules-core — the same parse → walk → dispatch-by-`SyntaxKind` the engine
uses — so the equivalence holds for the production path, not a test-only harness.

---

## 4. What was NOT migrated (and why)

### `no-import-cycles` (tier GRAPH) — DEFERRED to the module-graph batch
The category's fourth rule is **NOT** transformed in this slice. It is a **GRAPH-tier** rule
(`defineGraphRule`, legacy `…/module-boundaries/no-import-cycles.ts`): it does not walk a
single file's AST — it runs a 3-color DFS (RULE-015) over the **cross-file module graph**
that core builds. Migrating it needs two things that have not landed yet:
  - **`core/src/module-graph.ts`** — the module-graph builder that produces the
    `ModuleGraph` input (the type contract exists at `rules-core/effect/src/main/ModuleGraph.ts`,
    but nothing populates it yet).
  - **a GRAPH driver** — the test/engine harness analog of `runRule` for graph rules
    (`createGraphRuleContext` + an `analyze(ctx)` pass; there is no `runGraphRule` in
    rules-core today).
Until both exist there is no way to characterize it equivalently, so it is explicitly
deferred to the module-graph batch. When that batch lands, `no-import-cycles` will be added
to a separate `graphRuleRegistry` (not the SYN `moduleBoundariesRules` array here).

### Other non-migrations
- **The predicates stayed plain, synchronous AST visitors — NOT `Effect`-wrapped.**
  Deliberate and consistent with the substrate: rule visitors are pure sync callbacks over
  an in-memory `ts.forEachChild` walk; a fiber buys nothing. Effect appears only in the
  contract layer (`Diagnostic` / `RuleMeta` are `effect/Schema` in contracts), never in
  these predicates.
- **The substrate + contracts** (`defineRule` / `runRule` / `Diagnostic` / `RuleMeta`) were
  NOT copied — they are consumed read-only from their owning packages (see D1).
- **No dead code** in the three legacy SYN rule files — every line is live, nothing dropped.

---

## 5. Follow-ups

1. **Land `no-import-cycles` with the module-graph batch.** Needs `core/src/module-graph.ts`
   (the graph builder) + a GRAPH driver (`runGraphRule` / engine `analyze` pass). Then add it
   to a `graphRuleRegistry` alongside this slice's SYN `moduleBoundariesRules`.
2. **These 3 are SYN, engine-driven.** No bespoke driver is needed: the engine walks each
   file and dispatches by `SyntaxKind` exactly like `runRule`. When the full catalog lands,
   `moduleBoundariesRules` folds into the global `ruleRegistry` (the hand-written list in
   rules-core is the v1 codegen seam; legacy `scripts/generate-rule-registry.mjs` will
   replace both manual lists).
3. **Category registry shape.** `moduleBoundariesRules` is `ReadonlyArray<Rule>`; if the
   global codegen prefers a keyed map (`Record<id, Rule>`) the array can be folded with
   `Object.fromEntries(rules.map(r => [r.id, r]))` at the registry seam — no rule change.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** follows the established slice convention (the command
  template's Java-ism), honored as written for consistency with type-performance / rules-core.
- **`typescript` is a runtime `dependency`**, not a devDependency (the rules use the compiler
  API at runtime).
- **Run:** `cd modernized/rules-module-boundaries/effect && pnpm test` (vitest) ·
  `pnpm typecheck` (tsc). Both green: 26/26 · tsc exit 0.
