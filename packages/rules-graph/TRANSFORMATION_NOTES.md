# Transformation Notes — GRAPH-tier rules → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform ts-doctor rules-graph effect`.

Source (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor-rules/src/rules/` (the two GRAPH
rules + their `*.test.ts`), plus the `Diagnostic` / `RuleMeta` contracts and the
`defineGraphRule` / `runGraphRule` / `createGraphRuleContext` / `ModuleGraph` substrate, now
owned by `@ts-doctor/contracts-effect` and `@ts-doctor/rules-core-effect` respectively.
Target: `modernized/rules-graph/effect/` (package `@ts-doctor/rules-graph-effect`).

Implements ts-doctor's **2 GRAPH-tier rules**: **RULE-015** (`no-import-cycles` — 3-color
iterative DFS over the cross-file module graph) and **RULE-025 (dead-code row)**
(`no-unused-exports` — conservative unused-export detection, gated `requires:["app"]`). Both
are Tier **GRAPH**: they analyze the cross-file `ModuleGraph` core builds, NOT a single
file's AST, so they have the `GraphRule` shape (`analyze(ctx)` over a graph, not a
`SyntaxKind → visitor` map).

**Result:** 21/21 characterization tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · both `file:` deps
(`rules-core-effect`, `contracts-effect`) link and resolve · `runGraphRule` (the production
GRAPH driver) drives every test.

---

## 1. Mapping table (legacy rule file → target)

| Rule | Business rule | Legacy source | Target |
|------|---------------|---------------|--------|
| `no-import-cycles` | RULE-015 (import-cycle detection, 3-color DFS, GRAPH) | `…/module-boundaries/no-import-cycles.ts` | `src/main/no-import-cycles.ts` |
| `no-unused-exports` | RULE-025 (dead-code row: requires `app`, exempts wildcard/namespace/dynamic, GRAPH) | `…/dead-code/no-unused-exports.ts` | `src/main/no-unused-exports.ts` |
| graph barrel + `graphRules` registry | — (v1 manual codegen seam → `graphRuleRegistry`) | (codegen would fold into the global registry) | `src/main/index.ts` |
| `runGraphRule` test driver | the `run(graph)` helper in legacy `*.test.ts` | imported from `@ts-doctor/rules-core-effect` (not vendored) | `src/test/*.test.ts` |
| legacy `*.test.ts` vectors | the behavioral spec | `…/module-boundaries/no-import-cycles.test.ts` + `…/dead-code/no-unused-exports.test.ts` | ported into `src/test/*.test.ts` |

Each predicate was ported **VERBATIM**: same META (id / severity / category / tier `GRAPH` /
`requires` / fixKind / tags / recommendation), same `analyze` body — for `no-import-cycles`
the iterative tri-color (WHITE=0 / GRAY=1 / BLACK=2) DFS with the explicit stack and the
report-the-back-edge-target-once-at-line-1 logic; for `no-unused-exports` the
referenced/wildcard/usedExports conservative pass — same message / help text. The
diagnostic-construction (auto-fill of `plugin` / `rule` / `tier` / `category` / `severity`
from meta) is unchanged — it is the same `createGraphRuleContext` / `buildDiagnostic` path,
now living in `rules-core-effect`.

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** Both predicates are byte-for-byte the legacy logic. The only changes are
structural / dependency-routing:

### D1 — Import the substrate, do NOT re-vendor it
- `defineGraphRule` is imported from `@ts-doctor/rules-core-effect` instead of the legacy
  relative `../../define-rule.js`. (It is a runtime VALUE — not a type — so it is a regular
  import, inlined by Vitest.)
- `runGraphRule` (the GRAPH driver — the legacy tests' inline `run(graph)` helper that builds
  a `createGraphRuleContext` and calls `rule.analyze(ctx)`) is imported from
  `@ts-doctor/rules-core-effect` in the tests, so the tests exercise the REAL production
  driver — the same `createGraphRuleContext` + `analyze` pass the engine uses on the GRAPH
  path — not a test-only copy.
- `ModuleGraph` is imported as `import type` from `@ts-doctor/rules-core-effect` (it OWNS the
  GRAPH-tier input; it is not in contracts). The rule bodies never name `ModuleGraph` directly
  (it flows in via `ctx.graph`); only the test fixtures type-annotate it.
- `Diagnostic` / `RuleMeta` come from `@ts-doctor/contracts-effect` transitively (the rules
  never name them; they flow through `defineGraphRule` / `ctx.report`). This slice re-vendors
  no contract or substrate symbol.

### D2 — GRAPH rules use `defineGraphRule` / `analyze`, NOT the SYN/TYP AST visitor shape
This is the key structural difference from the SYN slices (e.g. module-boundaries). A SYN/TYP
rule is `defineRule(meta, (ctx) => ({ [SyntaxKind]: visitor }))` driven by `runRule`'s
parse → walk → dispatch. A GRAPH rule is `defineGraphRule(meta, (ctx) => { … })` whose `ctx`
carries the whole `ModuleGraph` (not a single `sourceFile`/`checker`) and whose body is a
single whole-graph `analyze` pass driven by `runGraphRule`. There is no AST, no walk, no
`SyntaxKind`.

### D3 — `typescript` is a DEV dependency here (NOT a runtime dep)
Unlike the SYN/TYP slices (where the rules call `ts.SyntaxKind` / `ts.is*` /
`getLineAndCharacterOfPosition` at runtime, making the compiler API a production dependency),
GRAPH rules do **not** touch the TS compiler API at all — they reason about an already-built
`ModuleGraph` of plain strings / Maps / Sets. `typescript` is therefore a **devDependency**
(only `tsc --noEmit` needs it), not a runtime `dependency`. The two `file:` deps
(`rules-core-effect`, `contracts-effect`) are the only runtime deps.

### D4 — Two `file:` deps + double inline (consumption pattern)
`package.json` adds `@ts-doctor/rules-core-effect` **and** `@ts-doctor/contracts-effect` as
`file:` deps. `vitest.config.ts` inlines **both** (`server.deps.inline`) because each is a
`.ts`-entry `file:` link and `defineGraphRule` / `runGraphRule` / `createGraphRuleContext` are
runtime values pulled from rules-core. **Note (architecture review):** unlike the sibling SYN
slices, these GRAPH rule bodies never NAME a contracts symbol in `src/` — `GraphRule` (= `RuleMeta`
& `{ analyze }`) flows from rules-core. The direct `@ts-doctor/contracts-effect` dep is therefore
declared for **hermetic TYPE resolution**: under pnpm's strict (non-hoisted) `node_modules`, `tsc`
resolving `GraphRule` needs `RuleMeta`'s definition (in contracts) reachable from THIS package, so
the transitively-required contract must be a direct dep — not because `src/` imports it. (Dropping
it would risk a type-resolution failure under strict installs.)

### D5 — Barrel hygiene (no symbol re-publishing)
`src/main/index.ts` exports only what this slice owns: the two rules (by stable name
`noImportCycles` / `noUnusedExports`) and `graphRules: ReadonlyArray<GraphRule>`. It does
**not** re-export `defineGraphRule` / `runGraphRule` / `ModuleGraph` / `Diagnostic` /
`RuleMeta` — consumers import those from their owning packages (mirrors rules-core's own
barrel discipline of not re-publishing contracts symbols).

### D6 — `requires:["app"]` gating is NOT enforced in `analyze` (engine's job)
`no-unused-exports`'s meta carries `requires:["app"]`, but the `analyze` body does NOT
re-check it. **Activation gating is the engine / `shouldActivate`'s job (RULE-019)** — the
engine decides whether to RUN a rule's `analyze` at all, based on the project capability set;
once `analyze` runs, it unconditionally produces findings. So the tests run `analyze`
directly (via `runGraphRule`) with no `app` capability and the rule still fires — exactly
matching legacy behavior, where the legacy tests also drove `analyze` directly without any
capability gate.

---

## 3. Equivalence strategy (the proof)

**Characterization-test TDD.** The legacy `*.test.ts` cases ARE the behavioral spec, so every
legacy vector was ported, then the implementation made to pass them. All tests are driven
through the REAL `runGraphRule` from rules-core — the same `createGraphRuleContext` +
`analyze(ctx)` pass the engine uses on the GRAPH path — over hand-built `ModuleGraph`
fixtures (`{ files, imports: Map, exports: Map, usedExports: Map, wildcardUsed: Set }`).

### `no-import-cycles` (8 tests)
- **Ported legacy vectors** (unchanged): 2-module cycle fires (asserts `tier === "GRAPH"`,
  `rule === "no-import-cycles"`); acyclic 3-node graph → 0 diagnostics.
- **Added (brief asks):** 3-module cycle (a → b → c → a, reported once at the back-edge
  target `/a.ts`); self-loop (a → a) reported once; a node shared by two cycles reported
  EXACTLY once (the `reported` set dedupe); empty graph → none; a file with a missing
  `imports` entry treated as no-deps (acyclic).
- **Added full-shape assertion:** the 2-module cycle's full diagnostic — `severity` (`error`),
  `category`, `plugin`, `filePath` (the back-edge target), `message`, `help`, `line` 1,
  `column` 1.

### `no-unused-exports` (9 tests)
- **Ported legacy vectors** (unchanged): unused name flagged in a referenced module (asserts
  `rule` / `tier` / message contains `unused`); entry/root (unreferenced) file's exports
  skipped; namespace/wildcard-used file exempt.
- **Added (brief asks):** a USED export name is NOT flagged; a re-export counts as a use
  (`barrel.ts` re-exports `a` → `a` is in util's `usedExports`, so only `b` is flagged).
- **Added edges:** every unused name in a referenced file gets its own diagnostic; a
  referenced file with no `exports` entry → none; the `requires:["app"]` meta is present but
  analyze fires regardless (gating is upstream — D6).
- **Added full-shape assertion:** the full diagnostic — `severity` (`warning`), `category`
  (`Dead Code & Unused Exports`), `plugin`, `filePath`, exact `message` / `help`, `line` 1,
  `column` 1.

### Registry (`index.test.ts`, 4 tests)
`graphRules` holds exactly the 2 GRAPH rules, uniquely id'd, all tier `GRAPH`; each named
export carries an `analyze` function; meta (severity / category / fixKind / tags / requires)
preserved per rule.

**21 tests total** (8 + 9 + 4). Because they run through the production `runGraphRule`, the
equivalence holds for the real GRAPH path, not a test-only harness.

---

## 4. What was NOT migrated (and why)

- **The predicates stayed plain, synchronous graph predicates — NOT `Effect`-wrapped.**
  Deliberate and consistent with the substrate: a graph rule is a pure in-memory pass over
  `Map`/`Set`/`string[]`; a fiber buys nothing. Effect appears only in the contract layer
  (`Diagnostic` / `RuleMeta` are `effect/Schema` in contracts), never in these predicates.
- **The substrate + contracts** (`defineGraphRule` / `runGraphRule` / `createGraphRuleContext`
  / `ModuleGraph` / `Diagnostic` / `RuleMeta`) were NOT copied — they are consumed read-only
  from their owning packages (see D1).
- **The TS compiler API.** GRAPH rules never use it (D3); `typescript` is dev-only.
- **The module-graph BUILDER.** This slice consumes a `ModuleGraph` but does not build one —
  populating the real graph from resolved in-project import edges is the engine's job (see §5).
- **No dead code** in either legacy rule file — every line is live, nothing dropped.

---

## 5. Follow-ups

1. **The engine builds the real `ModuleGraph` and drives these rules.** These two rules
   consume a `ModuleGraph`; producing one (resolving in-project import edges, named exports,
   per-name usage, and the wildcard/namespace/dynamic-import exempt set) is the
   **module-graph builder**'s job (legacy `core/src/module-graph.ts`), which the engine runs
   before driving each GRAPH rule's `analyze` pass exactly like `runGraphRule`. When the full
   catalog lands, `graphRules` folds into the global `graphRuleRegistry` (the hand-written
   list here is the v1 codegen seam; legacy `scripts/generate-rule-registry.mjs` will replace
   it by scanning `defineGraphRule(` call sites).
2. **`no-unused-exports` is gated `requires:["app"]` — engine activation (RULE-019 / RULE-021).**
   The engine's `shouldActivate` only runs this rule's `analyze` when the project's capability
   set (earned per RULE-021 from `discoverTsProject`) contains `app`. This gate is NOT in the
   rule body (D6); it must be honored by the engine activation pass that wraps `analyze`.
   `no-import-cycles` has no `requires`, so it activates whenever the GRAPH tier is eligible.
3. **Registry shape.** `graphRules` is `ReadonlyArray<GraphRule>`; if the global codegen
   prefers a keyed map (`Record<id, GraphRule>`) it can be folded with
   `Object.fromEntries(rules.map(r => [r.id, r]))` at the registry seam — no rule change.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** follows the established slice convention (the command
  template's Java-ism), honored as written for consistency with module-boundaries / rules-core.
- **`typescript` is a `devDependency`** (GRAPH rules don't use the compiler API at runtime —
  only `tsc --noEmit` needs it) — the distinguishing dependency-shape vs the SYN/TYP slices.
- **Run:** `cd modernized/rules-graph/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).
  Both green: 21/21 · tsc exit 0.
