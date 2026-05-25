# Transformation Notes — `rules-registry` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor rules-registry effect`.
Source (READ-ONLY, replaced — not line-ported):
`legacy/ts-doctor/packages/ts-doctor-rules/scripts/generate-rule-registry.mjs`
\+ its codegen output `rule-registry.generated.ts`.
Target: `modernized/rules-registry/effect/` (package `@ts-doctor/rules-registry-effect`).

This is a **pure aggregator** slice: it OWNS no rules. It imports every per-category
rule slice's exported rule array read-only and concatenates them into the two
registries the engine consumes — `ruleRegistry` (per-file SYN/TYP/CFG) and
`graphRuleRegistry` (GRAPH). It does **not** edit `legacy/` or any rule slice.

**Result:** 16/16 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. All 13 rule `file:`
imports + the transitive `@ts-doctor/contracts-effect` import resolve and run green
via `vitest.config.ts → test.server.deps.inline`.

---

## 1. What this replaces

Legacy assembled the global registry by **CODEGEN**: `scripts/generate-rule-registry.mjs`
scanned every `defineRule(` / `defineGraphRule(` call site under `rules/`, derived each
rule's `category` from its directory, and emitted `rule-registry.generated.ts` — a flat
`ruleRegistry` of per-file rules plus a separate `graphRuleRegistry` of GRAPH rules.

In the modernized strangler-fig world the rule catalog is **split across per-category
slices**, each a standalone package exporting its own `ReadonlyArray<Rule>` (or
`ReadonlyArray<GraphRule>`). The codegen scan-and-emit step is therefore replaced by a
**hand-assembled aggregator** (`src/main/registry.ts`) that spreads those slice arrays
into the two registries. Same output shape (`ReadonlyArray<Rule>` +
`ReadonlyArray<GraphRule>`), same partition (per-file vs GRAPH), no generated file.

| Legacy artifact | Target |
|-----------------|--------|
| `scripts/generate-rule-registry.mjs` (scan `defineRule(` call sites) | `src/main/registry.ts` (hand-assembled spread of slice arrays) |
| `rule-registry.generated.ts` → `ruleRegistry` (flat per-file list) | `ruleRegistry: ReadonlyArray<Rule>` (CFG strictness + 11 SYN/TYP slices) |
| `rule-registry.generated.ts` → `graphRuleRegistry` | `graphRuleRegistry: ReadonlyArray<GraphRule>` (the rules-graph slice) |
| codegen `category` derived from directory | `category` carried on each rule's `RuleMeta` by its owning slice |

The `Rule` / `GraphRule` TYPES are imported from `@ts-doctor/rules-core-effect` (the
substrate, canonical home for the rule shapes); the embedded data contracts
(`Diagnostic` / `RuleMeta`) live transitively in `@ts-doctor/contracts-effect`.

---

## 2. The 86 + 2 = 88 tally

The full catalog, by source slice (each verified by reading the slice's `src/main/index.ts`
barrel for its exported array name):

| Slice (package) | Exported array | Tier(s) | Count |
|-----------------|----------------|---------|-------|
| `@ts-doctor/rules-core-effect` | `ruleRegistry` (strictness) | CFG | 4 |
| `@ts-doctor/rules-type-performance-effect` | `typePerformanceRules` | SYN/TYP | 3 |
| `@ts-doctor/rules-declaration-api-effect` | `declarationApiRules` | SYN/TYP | 4 |
| `@ts-doctor/rules-security-effect` | `securityRules` | SYN/TYP | 5 |
| `@ts-doctor/rules-naming-idioms-effect` | `namingIdiomsRules` | SYN/TYP | 14 |
| `@ts-doctor/rules-generics-effect` | `genericsRules` | SYN/TYP | 5 |
| `@ts-doctor/rules-type-assertions-effect` | `typeAssertionsRules` | SYN/TYP | 13 |
| `@ts-doctor/rules-async-effect` | `asyncRules` | SYN/TYP | 7 |
| `@ts-doctor/rules-error-handling-effect` | `errorHandlingRules` | SYN/TYP | 8 |
| `@ts-doctor/rules-type-safety-effect` | `typeSafetyRules` | SYN/TYP | 12 |
| `@ts-doctor/rules-exhaustiveness-effect` | `exhaustivenessRules` | SYN/TYP | 8 |
| `@ts-doctor/rules-module-boundaries-effect` | `moduleBoundariesRules` | SYN/TYP | 3 |
| **`ruleRegistry` subtotal** | | **CFG/SYN/TYP** | **86** |
| `@ts-doctor/rules-graph-effect` | `graphRules` | GRAPH | 2 |
| **`graphRuleRegistry` subtotal** | | **GRAPH** | **2** |
| **Combined catalog** | | | **88** |

By tier (asserted in tests): **CFG 4** (strictness) + **SYN 64** + **TYP 18** = 86 in
`ruleRegistry`; **GRAPH 2** in `graphRuleRegistry`. `ruleRegistry` holds NO GRAPH rules;
`graphRuleRegistry` holds ONLY GRAPH rules.

---

## 3. The global-unique-id invariant

The single load-bearing correctness invariant of the aggregator: **every rule id is
globally unique across BOTH registries**. A duplicate id would either double-count a rule
(it would run twice and its findings would appear twice) or shadow another rule that
shares its id in downstream id-keyed lookups (ignore lists, `--explain`, severity
overrides). The test asserts `new Set(allIds).size === allRules.length === 88` and, on
failure, names the colliding ids so the dup is actionable. Confirmed: **88 ids, 88 unique,
zero collisions.**

---

## 4. `file:` dependency consumption

Thirteen rule packages + `@ts-doctor/contracts-effect` are consumed as `file:` deps (every
entry point is a `.ts` file via `exports: "./src/main/index.ts"`). Each is listed in
`vitest.config.ts → test.server.deps.inline` so Vitest's esbuild transform compiles their
TypeScript at test time instead of trying to load them as pre-built deps (which would fail
to parse the `.ts`). The inline list is the full transitive `.ts`-entry closure: the 13
rule packages + contracts (the rule slices also import each other's substrate
`rules-core-effect`, already in the list). `typescript` is a DEV dep only — the aggregator
itself uses no `ts` at runtime (it never touches the compiler API; it only re-exports rule
objects). The package-name `file:` imports run green; no relative-path fallback was needed.

---

## 5. Verification

- `ruleRegistry` length === 86; `graphRuleRegistry` length === 2; combined === 88; the
  computed `totalRuleCount` helper === 88.
- Globally-unique ids: set size === 88 === total (no collision).
- Tier partition: `ruleRegistry` ⊆ {SYN, TYP, CFG} (no GRAPH); `graphRuleRegistry` = {GRAPH}.
  Per-tier counts CFG 4 / SYN 64 / TYP 18 / GRAPH 2.
- Shape: every `ruleRegistry` entry has the required `RuleMeta` fields
  (`id`/`severity`/`category`/`tier`) + a `create()` factory; every `graphRuleRegistry`
  entry has those fields + an `analyze()` function.
- Spot-check: `enable-strict`, `no-explicit-any`, `no-floating-promises`, `triple-equals`
  present in `ruleRegistry`; `no-import-cycles` present in `graphRuleRegistry`.

16/16 tests pass · `tsc --noEmit` exit 0.

---

## 6. Follow-ups

- **Engine wiring:** the engine slice imports `ruleRegistry` / `graphRuleRegistry` from
  here (the single global entry point), replacing any reference to the legacy generated
  registry.
- **Codegen regeneration:** when the per-category slices are published as real (non-`file:`)
  packages, a codegen step could regenerate `src/main/registry.ts` mechanically by
  enumerating the published rule slices and their exported array names — restoring the
  legacy "scan and emit" ergonomics without the hand-maintained import list. The
  hand-assembled list is the v1 seam (mirrors the manual-registry seam in `rules-core`).
- **Tally drift guard:** the 88 / unique-id tests double as a regression guard — adding a
  rule to any slice (or a new slice) requires updating the aggregator + the asserted
  counts, so a silently-dropped or double-imported slice fails CI.
