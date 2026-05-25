# Transformation Notes — `type-performance` rule category → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform tsnuke rules-type-performance effect`.

Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/rules/type-performance/`
(+ the `Diagnostic`/`RuleMeta` contracts and the `defineRule`/`runRule` substrate, now
owned by `@tsnuke/contracts-effect` and `@tsnuke/rules-core-effect` respectively).
Target: `modernized/rules-type-performance/effect/` (package
`@tsnuke/rules-type-performance-effect`).

Implements **RULE-008** (large union > 12 members), **RULE-009** (large intersection
> 5 members), **RULE-010** (large object-literal type alias > 12 members → prefer an
`interface`). All three are Tier-1 **SYN** (AST-only) pure predicates.

**Result:** 21/21 characterization tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · both `file:` deps
(`rules-core-effect`, `contracts-effect`) link and resolve.

---

## 1. Mapping table (legacy rule file → target)

| Rule | Business rule | Legacy source | Target |
|------|---------------|---------------|--------|
| `no-large-union-type` | RULE-008 (union > 12) | `…/type-performance/no-large-union-type.ts` | `src/main/no-large-union-type.ts` |
| `no-large-intersection-type` | RULE-009 (intersection > 5) | `…/type-performance/no-large-intersection-type.ts` | `src/main/no-large-intersection-type.ts` |
| `prefer-interface-for-large-object-type` | RULE-010 (object alias > 12) | `…/type-performance/prefer-interface-for-large-object-type.ts` | `src/main/prefer-interface-for-large-object-type.ts` |
| category barrel + `typePerformanceRules` registry | — (v1 manual codegen seam) | (codegen would fold into the global registry) | `src/main/index.ts` |
| `runRule` test driver | legacy `tsnuke-rules/src/test-utils.ts` | imported from `@tsnuke/rules-core-effect` (not vendored) | `src/test/*.test.ts` |
| legacy `*.test.ts` vectors | the behavioral spec | `…/type-performance/*.test.ts` | ported into `src/test/*.test.ts` |

Each predicate was ported **VERBATIM** — same threshold constants
(`MAX_UNION_MEMBERS = 12`, `MAX_INTERSECTION_MEMBERS = 5`,
`LARGE_OBJECT_TYPE_MEMBERS = 12`), same `ts.is*` guards, same `> N` (exclusive)
comparisons, same `getLineAndCharacterOfPosition` + `+1` 1-based position, same report
message / help text, same meta (id / severity / category / tier / fixKind / tags /
recommendation). The diagnostic-construction itself (auto-fill of `plugin` /
`rule` / `tier` / `category` / `severity` from meta) is unchanged — it is the same
`createRuleContext` / `buildDiagnostic` path, now living in `rules-core-effect`.

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** The predicates are byte-for-byte the legacy logic. The only changes
are structural / dependency-routing:

### D1 — Import the substrate, do NOT re-vendor it
- `defineRule` (and the `Rule` / `RuleContext` types) are imported from
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
rules-core itself imports contracts — same pattern build-report uses for `score` + contracts.

### D3 — Barrel hygiene (no symbol re-publishing)
`src/main/index.ts` exports only what this slice owns: the three rules (by stable name) and
`typePerformanceRules: ReadonlyArray<Rule>`. It does **not** re-export `defineRule` /
`runRule` / `Diagnostic` / `RuleMeta` — consumers import those from their owning packages
(mirrors rules-core's own barrel discipline of not re-publishing contracts symbols).

### D4 — RULE-010's two `12`s kept independent (suspected-defect preservation)
`LARGE_OBJECT_TYPE_MEMBERS = 12` is its own constant, deliberately NOT sharing the
identifier with RULE-008's `MAX_UNION_MEMBERS = 12` (different files entirely). BUSINESS_RULES
RULE-010 flags that these two `12`s must stay independently tunable so they cannot
accidentally couple; preserving them as separate constants keeps that property. (Documented
inline at the constant.)

---

## 3. Equivalence strategy (the proof)

**Characterization-test TDD.** The legacy `*.test.ts` cases ARE the behavioral spec, so
every legacy vector was ported first, then the implementation made to pass them:

- **Ported legacy vectors** (the equivalence proof): the exact `LARGE_UNION` / `BOUNDARY_UNION`
  / large-intersection / small-intersection / `LARGE_OBJECT_TYPE` / `BOUNDARY_OBJECT_TYPE`
  snippets and assertions, unchanged. Passing them = behaviorally identical to legacy.
- **Added boundary cases:** exactly-at-threshold (12 / 5 / 12 — must NOT fire, since `>` is
  exclusive) vs one-over (13 / 6 / 13 — fires). These pin the off-by-one boundary the legacy
  tests only checked on one side per rule.
- **Added scoping cases (the per-rule edge notes from the rules):**
  - RULE-008 "only direct alias RHS": a wide union nested in an array type / used as a
    function-parameter type does NOT fire (`node.type` isn't a `UnionTypeNode`).
  - RULE-009 "intersection anywhere": a 6-member intersection nested in an array type / a
    function parameter DOES fire (not limited to aliases).
  - RULE-010 "only direct object-literal aliases": an `interface` and an intersection-RHS
    alias do NOT fire.
- **Added full-shape assertions:** every diagnostic's 1-based `line` / `column`, `message`,
  `help`, `severity`, `tier`, `category`, `plugin`, and `rule` id are asserted (the legacy
  tests asserted only `rule` / `tier` / `severity` / length).

**21 tests total** (7 per rule). Driven through the real `runRule` from rules-core — the
same parse → walk → dispatch-by-`SyntaxKind` the engine uses — so the equivalence holds for
the production path, not a test-only harness.

---

## 4. What was NOT migrated (and why)

- **The predicates stayed plain, synchronous AST visitors — NOT `Effect`-wrapped.**
  Deliberate and consistent with the substrate: rule visitors are pure sync callbacks over
  an in-memory `ts.forEachChild` walk; a fiber buys nothing and costs the "performant" goal.
  Effect appears only in the contract layer (`Diagnostic` / `RuleMeta` are `effect/Schema`
  in contracts), never in these predicates.
- **The substrate + contracts** (`defineRule` / `runRule` / `Diagnostic` / `RuleMeta`) were
  NOT copied — they are consumed read-only from their owning packages (see D1).
- **No dead code** in the three legacy rule files — every line is live, so nothing dropped.

---

## 5. Follow-ups

1. **These are SYN, engine-driven.** No bespoke driver is needed: the engine walks each file
   and dispatches by `SyntaxKind` exactly like `runRule` (one parse, walk, dispatch). When the
   full catalog lands, `typePerformanceRules` folds into the global `ruleRegistry` (the
   hand-written list in rules-core is the v1 codegen seam; legacy
   `scripts/generate-rule-registry.mjs` will replace both manual lists).
2. **Hardcoded thresholds (RULE-025 open question).** The three budgets — union 12,
   intersection 5, object 12 — are hardcoded per RULE-008/009/010. RULE-025's SME question
   (BUSINESS_RULES.md §"SME questions" #5) is unresolved: *are 12 / 5 / 12 deliberate,
   validated product budgets or placeholder defaults?* This decides whether they become
   user-tunable config in the rewrite. Until answered, they stay hardcoded constants
   (legacy parity). RULE-010 additionally requires the two `12`s stay **independent** even
   if both become config (see D4) — they must not collapse to one shared key.
3. **Category registry shape.** `typePerformanceRules` is `ReadonlyArray<Rule>`; if the
   global codegen prefers a keyed map (`Record<id, Rule>`) the array can be folded with
   `Object.fromEntries(rules.map(r => [r.id, r]))` at the registry seam — no rule change.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** follows the established slice convention (the command
  template's Java-ism), honored as written for consistency with score / rules-core.
- **`typescript` is a runtime `dependency`**, not a devDependency (the rules use the compiler
  API at runtime) — this is the one package.json deviation from the pure-function slices
  (score/build-report), which only need TS to typecheck.
- **Run:** `cd modernized/rules-type-performance/effect && pnpm test` (vitest) ·
  `pnpm typecheck` (tsc). Both green: 21/21 · tsc exit 0.
