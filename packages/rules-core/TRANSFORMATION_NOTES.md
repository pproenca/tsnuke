# Transformation Notes — `rules-core` substrate → Effect-TS

Strangler-fig slice produced for the ts-doctor modernization. Builds the **rule
SUBSTRATE** (`defineRule` + rule context/visitor shape + registry + diagnostic
identity) plus the AST-free `strictness` rule category (RULE-020) as the first
proof-of-pattern — the foundation the ~88 rule predicates and the engine plug into.

Source (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor-rules/src/`
\— `define-rule.ts` (124→ substrate), `identity.ts` (BC-13), `types.ts`
(`ModuleGraph`), `rules/strictness/{enable-strict, enable-no-unchecked-indexed-access,
enable-exact-optional-property-types, enable-use-unknown-in-catch}.ts`.
Target: `modernized/rules-core/effect/` (package `@ts-doctor/rules-core-effect`).

This slice is the **FIRST NEW consumer of `@ts-doctor/contracts-effect`**: it
IMPORTS `Diagnostic` / `RuleMeta` (and transitively `Severity` / `Tier` / `FixKind` /
`Fix` / `TextEdit` / `Capability`) from contracts rather than vendoring them —
exactly the de-vendor direction the contracts package was created to enable.
`ModuleGraph` (the GRAPH-tier input) is OWNED HERE — it is single-site, not
duplicated across slices, and the contracts package explicitly excludes it.

The substrate is **PLAIN TypeScript** wrapping the TS compiler API — NOT
Effect-wrapped. Rule visitors are pure synchronous AST callbacks; a fiber buys
nothing for an in-memory `ts.forEachChild` walk. Effect appears only via the
imported contracts Schemas' `.Type` (the data contracts).

**Result:** 55/55 characterization tests pass · `tsc --noEmit` clean under `strict`
\+ `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · the contracts `file:`
import resolves and the equivalence proof holds (modern substrate === frozen legacy).

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `ts-doctor-rules/src/…` | Target |
|----------|--------------------------------|--------|
| `PLUGIN_NAME = "ts-doctor"` (BC-18) | `define-rule.ts:5` | `src/main/defineRule.ts` |
| `ReportInput` (Omit/Partial shape) | `define-rule.ts:13-17` | `src/main/defineRule.ts` |
| `RuleContext` (`sourceFile`/`checker?`/`filePath`/`report`) | `define-rule.ts:20-35` | `src/main/defineRule.ts` |
| `RuleVisitors` (`{ [K in ts.SyntaxKind]?: … }`) | `define-rule.ts:38-40` | `src/main/defineRule.ts` |
| `Rule = RuleMeta & { create }` | `define-rule.ts:43-46` | `src/main/defineRule.ts` |
| `createRuleContext` (auto-fill + exactOptional spread) | `define-rule.ts:54-93` | `src/main/defineRule.ts` (`createRuleContext` + `buildDiagnostic`) |
| `defineRule(meta, create)` | `define-rule.ts:101-106` | `src/main/defineRule.ts` |
| `GraphRuleContext` | `define-rule.ts:115-119` | `src/main/defineRule.ts` |
| `GraphRule = RuleMeta & { analyze }` | `define-rule.ts:122-124` | `src/main/defineRule.ts` |
| `createGraphRuleContext` | `define-rule.ts:130-157` | `src/main/defineRule.ts` (shares `buildDiagnostic`) |
| `defineGraphRule(meta, analyze)` | `define-rule.ts:163-168` | `src/main/defineRule.ts` |
| `diagnosticIdentity` (BC-13) | `identity.ts:12-14` | `src/main/identity.ts` |
| `ModuleGraph` (GRAPH-tier graph) | `types.ts:79-95` | `src/main/ModuleGraph.ts` (owned here) |
| `enable-strict` (RULE-020) | `rules/strictness/enable-strict.ts` | `src/main/rules/strictness/enable-strict.ts` |
| `enable-no-unchecked-indexed-access` (RULE-020) | `rules/strictness/enable-no-unchecked-indexed-access.ts` | same path |
| `enable-exact-optional-property-types` (RULE-020) | `rules/strictness/enable-exact-optional-property-types.ts` | same path |
| `enable-use-unknown-in-catch` (RULE-020, dual gate) | `rules/strictness/enable-use-unknown-in-catch.ts` | same path |
| rule registry (the 4 rules) | `rule-registry.generated.ts` (codegen) | `src/main/registry.ts` (manual v1 seam) |
| `Diagnostic` / `RuleMeta` / `Severity` / `Tier` / `FixKind` | `types.ts` (owned by rules) | **imported** from `@ts-doctor/contracts-effect` |

---

## 2. Deliberate deviations from legacy

### D1 — Import `Diagnostic` / `RuleMeta` from contracts instead of vendoring ✅
Legacy `ts-doctor-rules` OWNED these types in `types.ts`. The modernization
consolidated the cross-cutting domain contracts into `@ts-doctor/contracts-effect`
(the score / filter-pipeline / build-report slices each vendored identical copies).
This slice is the **first NEW consumer**: it imports `Diagnostic` / `RuleMeta` from
contracts (and transitively the `Severity` / `Tier` / `FixKind` / `Fix` / `TextEdit`
/ `Capability` family). The contracts `Diagnostic` / `RuleMeta` are proven structural
supersets of every vendored copy, so the substrate's `ReportInput`
(`Omit<Diagnostic, …> & Partial<Pick<Diagnostic, …>>`) and the auto-fill build the
exact same shape — confirmed by `equivalence.test.ts` (`toStrictEqual` vs a frozen
legacy oracle that builds the diagnostic by hand).

### D2 — `ModuleGraph` owned HERE (not in contracts) ✅
`ModuleGraph` is the GRAPH-tier INPUT consumed only by graph rules — single-site, no
cross-slice duplication to consolidate. The contracts package explicitly notes it is
NOT modeled there ("`ModuleGraph` (GRAPH-tier input, not duplicated across slices)").
It is modeled as a plain `interface` (not an `effect/Schema`): an in-memory structure
built by core, never decoded at a trust boundary, with `Map`/`Set` members that are
not naturally Schema-shaped.

### D3 — Shared `buildDiagnostic` helper (factored from two duplicated bodies) ⚠ (behavior-identical)
Legacy `createRuleContext.report` and `createGraphRuleContext.report` contained the
SAME ~16-line diagnostic-build + conditional-spread, copy-pasted. The modern version
factors that into one private `buildDiagnostic(meta, input)`; both `report`s call it.
This is a pure internal refactor — NOT exported, behavior byte-identical (the
exactOptional conditional spread is preserved EXACTLY). Proven equivalent to the
legacy inline body by `equivalence.test.ts` over minimal / all-overridden /
each-optional-present / each-optional-absent fixtures.

### D4 — Substrate stays PLAIN TS (no Effect monad) ✅
`defineRule` / `createRuleContext` / `defineGraphRule` / `createGraphRuleContext` /
`diagnosticIdentity` are plain synchronous functions over the TS compiler API. Rule
visitors are pure sync AST callbacks; wrapping them in `Effect` would add ceremony
with no concurrency/error-channel benefit. Effect is used ONLY for the imported data
contracts (`Diagnostic` / `RuleMeta` are `effect/Schema`, consumed as `.Type`). This
matches the established slice idiom ("Plain TS substrate + contracts Schemas for the
data contracts. NOT Effect-monad.").

### D5 — `exactOptionalPropertyTypes`-safe conditional spread preserved EXACTLY ✅
`url` / `fix` / `suppressionHint` (and the `checker` field on the context) are spread
in ONLY when present (`...(x !== undefined ? { x } : {})`), so an absent optional is
ABSENT on the output object — not `key: undefined`. The meta-derived fields
(`rule`/`tier`/`category`/`severity`) are spelled out (not a `Partial` spread) so they
stay strongly non-optional. Pinned by `createRuleContext.test.ts`
(`expect(out).not.toHaveProperty("url")`).

---

## 3. What was NOT migrated (and why)

- **The ~84 AST / TYP / GRAPH rule predicates.** Only the 4 AST-free `strictness`
  CFG rules (RULE-020) are ported, as the first proof-of-pattern for the substrate.
  The remaining categories (async / declaration-api / error-handling / exhaustiveness
  / generics / module-boundaries / naming-idioms / type-safety / …) are a
  category-by-category port that is the **next phase** — they plug into the same
  `defineRule`/`createRuleContext` substrate built here.
- **The codegen registry.** Legacy generates `rule-registry.generated.ts` via
  `scripts/generate-rule-registry.mjs` (scanning `defineRule(`/`defineGraphRule(`
  call sites). In v1 the registry is a hand-written `ruleRegistry` (`registry.ts`) of
  the 4 strictness rules — the intentional **v1 seam**, with the same
  `ReadonlyArray<Rule>` shape the codegen output will have. No `graphRuleRegistry` yet
  (no GRAPH rules ported). Wiring the codegen is a follow-up.
- **`shouldActivate` / `resolveSeverity` (the activation predicate).** RULE-020's
  actual activation (a rule fires iff its `disabledBy` token is ABSENT from the
  project's capability set) lives in the **capabilities** slice, NOT here. This slice
  owns the META that drives activation; the predicate consumes it. The strictness
  tests therefore assert the gating META (`requires`/`disabledBy`), not `shouldActivate`.
- **Presets** (`presets.ts` — projections of the registry) — owned alongside the full
  catalog; out of scope for the substrate slice.
- **The `runRule` / `runTypeAwareRule` AST test drivers** — legacy `test-utils.ts`.
  Not needed yet: the 4 ported rules are AST-free (`create()` → `{}`), so there is no
  AST to walk. These drivers come with the first real AST rule category.

---

## 4. Follow-ups for the next module(s)

1. **Port the AST/TYP rule categories.** Each plugs into this substrate via
   `defineRule(meta, create)` (or `defineGraphRule(meta, analyze)` for GRAPH). Bring
   over `test-utils.ts`'s `runRule`/`runTypeAwareRule` drivers when the first AST rule
   lands (they exercise `createRuleContext` over a real parsed `ts.SourceFile`).
2. **Wire the codegen registry.** Replace the manual `registry.ts` with a generated
   `rule-registry.generated.ts` (port `scripts/generate-rule-registry.mjs`, scanning
   `defineRule(`/`defineGraphRule(` call sites) once the catalog is large enough to
   warrant it. Add `graphRuleRegistry` when GRAPH rules are ported. Keep the
   `defineRule(` call shape stable so the scanner finds every rule.
3. **The engine drives the substrate.** The upcoming engine slice calls
   `rule.create(ctx)` / `rule.analyze(ctx)` per file/graph, building `ctx` via
   `createRuleContext` / `createGraphRuleContext` with a `sink` that collects
   diagnostics. For CFG rules (the 4 here) the engine emits a single project-level
   diagnostic from the activation decision (RULE-020) — `create()` is a no-op.
4. **Presets** land with the full catalog (projection of `ruleRegistry`).
5. **`ModuleGraph` builder** lives in core/discovery (it assembles the graph from
   resolved edges); GRAPH rules then `analyze` it via `createGraphRuleContext`.

---

## 5. Toolchain / housekeeping notes

- **`file:` workspace dependency:** `package.json` declares
  `"@ts-doctor/contracts-effect": "file:../../contracts/effect"`. `pnpm install` links
  it; the package-name import (`from "@ts-doctor/contracts-effect"`) resolves to the
  contracts slice's `src/main/index.ts` (its `exports` entry). This is the same
  `file:`-dep pattern build-report uses for `@ts-doctor/score-effect`.
- **`typescript` is a real DEPENDENCY (not devDependency):** the substrate's context
  types wrap the TS compiler API (`ts.SourceFile` / `ts.TypeChecker` / `ts.SyntaxKind`
  / `ts.Node`), so `typescript` is part of the public type surface and consumers need
  it at type-check time. Imported as `import type ts from "typescript"` (type-only).
- **Vitest `.ts`-dependency transpile:** `vitest.config.ts` sets
  `test.server.deps.inline: ["@ts-doctor/contracts-effect"]` so esbuild compiles the
  dependency's TypeScript at test time (otherwise Vitest tries to load the `.ts` entry
  as pre-built and fails to parse it). Same fix as build-report's score dep.
- **`pnpm-workspace.yaml`** approves the `esbuild` build (vitest needs it), matching
  the other slices.
- **ESM + `.js` relative specifiers + `verbatimModuleSyntax`**: imports use `.js`
  extensions on relative specifiers (resolved to `.ts` by `Bundler` moduleResolution),
  `import type` for type-only imports — same conventions as the reference slices.
- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (same as every other slice).
- **Run:** `cd modernized/rules-core/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (55 tests)

| File | Tests | Covers |
|------|-------|--------|
| `createRuleContext.test.ts` | 14 | the substrate's core auto-fill: `plugin` forced (BC-18), meta-derived defaults + each overridable, required passthrough, the exactOptional spread (url/fix/suppressionHint omitted when absent, set when present), `checker` exactOptional |
| `strictnessRules.test.ts` | 13 | the 4 RULE-020 rules: EXACT meta verbatim (every field), `create()` → `{}` (AST-free), RULE-031/032 vocabulary in meta, the gating META incl. the `enable-use-unknown-in-catch` dual gate |
| `equivalence.test.ts` | 14 | THE PROOF — modern `createRuleContext.report` === frozen legacy oracle over 6 ReportInputs; modern strictness meta === legacy meta (4); modern `diagnosticIdentity` === legacy (3) |
| `graphSubstrate.test.ts` | 5 | GRAPH variants: `createGraphRuleContext.report` auto-fill + exactOptional + overrides; `defineGraphRule` (analyze, no create); the `ModuleGraph` contract shape |
| `registry.test.ts` | 5 | the v1 manual `ruleRegistry`: exactly 4 rules, every expected id, unique ids, required metadata, all CFG strictness |
| `identity.test.ts` | 4 | BC-13: exact format, stability, distinguishes identity fields, independent of non-identity fields |

---

## Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the contracts de-vendor sweep. **No HIGH findings.** The critic
diffed `createRuleContext.report` and all 4 strictness metas field-by-field against the
real `legacy/` source (via the symlink) — byte-faithful, incl. the exactOptional spreads
and `enable-use-unknown-in-catch`'s dual `disabledBy`. Confirmed barrel hygiene (no
contracts symbol re-exported), the `defineGraphRule` GRAPH substrate is a faithful carry
(not speculative), and the manual `ruleRegistry` order matches what the legacy codegen
would emit. **No changes required.**

**Recorded (cross-cutting, MEDIUM — applies to EVERY slice's equivalence proof):**
- The "frozen legacy oracle" in each `equivalence.test.ts` is a hand-vendored
  re-encoding, not the real legacy code, so a transcription error in an oracle would be
  invisible (modern + oracle could agree while both drift from legacy). The risk is
  currently *unrealized* — multiple reviews have manually diffed the oracles against
  `legacy/` and they match — but the proof strategy has this structural gap.
  **Recommended hardening pass:** for the pure, type-only-import legacy modules (score,
  capabilities, engine-plan, exit-code, filter-pipeline, config-sanitize, scale-memory,
  rules-core), import the REAL legacy function directly via the `legacy/` symlink as the
  oracle (it transpiles — those legacy files have only erased `import type`s), eliminating
  the hand-copy; for I/O modules, add a CI guard diffing the vendored oracle against
  `legacy/`. Deferred as a dedicated test-infra pass (not a per-slice quick fix).

**Recorded (LOW):** post-de-vendor, a few capabilities doc comments / test prose still
say "vendored contract" where it is now imported from `@ts-doctor/contracts-effect`
(accuracy only); `capabilities` barrel additively exposes `decodeRuleMeta` (harmless,
`engine-plan` doesn't use it).
