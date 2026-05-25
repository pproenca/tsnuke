# Transformation Notes — module-graph builder → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform ts-doctor module-graph effect`.

Source (READ-ONLY): `legacy/ts-doctor/packages/core/src/module-graph.ts` (215 lines).
Target: `modernized/module-graph/effect/` (package `@ts-doctor/module-graph-effect`).

Transforms the GRAPH-tier **module-graph builder** `buildModuleGraph(files)` — the pure
function that assembles the cross-file `ModuleGraph` the GRAPH rules (e.g. RULE-015
import-cycle detection) and the engine consume. It parses each file via the TS compiler API
and resolves RELATIVE import/export/dynamic-import specifiers against the in-project file
set.

**Result:** 45/45 tests pass (32 characterization + 13 differential-equivalence) ·
`tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes` + `verbatimModuleSyntax` · the `@ts-doctor/rules-core-effect`
`file:` dep links and the `ModuleGraph` type import resolves.

---

## 1. Mapping table (legacy module-graph.ts → target)

| Legacy symbol (`packages/core/src/module-graph.ts`) | Target |
|------|--------|
| `buildModuleGraph(files: GraphFileInput[]): ModuleGraph` | `src/main/buildModuleGraph.ts` → `buildModuleGraph` (ported VERBATIM) |
| `interface GraphFileInput` (`{ filePath; text }`) | `src/main/buildModuleGraph.ts` → exported `GraphFileInput` (defined HERE) |
| `candidatesFor(base)` (extension/index candidates + `.js`→`.ts` stem-swap) | private fn in `buildModuleGraph.ts` (verbatim) |
| `exportedNamesOfStatement(node)` (exported-decl name collection) | private fn in `buildModuleGraph.ts` (verbatim) |
| `import type { ModuleGraph } from "@ts-doctor/rules"` | `import type { ModuleGraph } from "@ts-doctor/rules-core-effect"` (now OWNED by rules-core) |
| package barrel | `src/main/index.ts` (exports `buildModuleGraph` + `GraphFileInput`) |
| (no legacy `.test.ts` existed) | `src/test/buildModuleGraph.test.ts` (characterization) + `src/test/oracle.ts` (frozen legacy snapshot) + `src/test/equivalence.test.ts` (differential proof) |

The algorithm was ported **VERBATIM**: same candidate list & order, same `.js/.jsx/.mjs/.cjs`
→ `.ts/.tsx/.d.ts` stem-swap, same `spec.startsWith(".")` relative-only gate, same self-edge
exclusion (`target !== f.filePath`), same `addEdge` dedup-in-encounter-order, same per-node
dispatch (`ImportDeclaration` / `ExportDeclaration` / `ImportEqualsDeclaration` / dynamic
`import()` call / `ExportAssignment` / exported-decl fallback), same `markUsed`
(propertyName ?? name) semantics, same `wildcardUsed` triggers (namespace import / `export *`
/ `export * as ns` / `import = require` / dynamic import), same `ts.ScriptKind` choice
(`endsWith("x")` → TSX), same output shape (`files` = input filePaths in order).

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** `buildModuleGraph` is byte-for-byte the legacy logic (the
differential proof in §3 pins this). Changes are structural / dependency-routing only:

### D1 — Pure synchronous function, NOT `Effect`-wrapped
The builder does NO I/O: it receives already-in-memory file **text** (`GraphFileInput[]`),
parses it (`ts.createSourceFile`), and resolves specifiers against the input set with
`node:path`. There is no filesystem, network, or other effectful boundary to model, so
wrapping it in `Effect` would add a fiber for nothing and obscure its purity. Reading files
from disk is the **engine's** `FileSystem` concern (see §5), not this builder's — the engine
reads, then calls this pure function. (Consistent with the rules-core / type-performance
slices, whose AST visitors are likewise plain sync.)

### D2 — Takes file TEXT, not a FileSystem
Re-stating D1 as a contract decision: the input is `{ filePath; text }[]`, never a directory
handle or `FileSystem` service. Resolution is purely string/path arithmetic over the
provided set (`known` map of `resolve(filePath) → original filePath`); a specifier that
points outside the set simply yields no edge. This keeps the builder trivially testable with
crafted in-memory projects and free of any I/O capability requirement.

### D3 — `ModuleGraph` imported from rules-core (not redefined, not in contracts)
The legacy file imported `ModuleGraph` from `@ts-doctor/rules`; the modernized type is OWNED
by `@ts-doctor/rules-core-effect` (single-site GRAPH-tier input, deliberately NOT in the
shared `@ts-doctor/contracts-effect`). We `import type { ModuleGraph }` from rules-core —
which is **erased at runtime** under `verbatimModuleSyntax`, so this is a compile-time-only
link and introduces no runtime dependency on rules-core. `GraphFileInput`, by contrast, is
**defined here** (the builder owns its own input shape, as the legacy file did).

### D4 — `typescript` is a runtime `dependency`, not a devDependency
The builder calls `ts.createSourceFile` / `ts.is*` / `ts.forEachChild` /
`ts.getModifiers` at **runtime**, so the compiler API is a production dependency (same as
rules-core / type-performance), unlike the pure-arithmetic slices (score) where TS is
build-only.

### D5 — Barrel hygiene
`src/main/index.ts` publishes only what this slice owns: `buildModuleGraph` (value) and
`GraphFileInput` (type). It does NOT re-export `ModuleGraph` — consumers import that from its
owner, `@ts-doctor/rules-core-effect` (mirrors the rules-core / type-performance barrel
discipline of not re-publishing types they don't own).

---

## 3. Equivalence strategy (the proof) — vs a vendored frozen oracle

There is **NO legacy `.test.ts`** for `module-graph.ts`, so "equivalence" cannot mean
"re-run the legacy tests". Instead the proof is **differential against a frozen snapshot of
the legacy algorithm itself**:

- **`src/test/oracle.ts`** — a vendored, verbatim copy of the legacy `buildModuleGraph` plus
  its two helpers (`candidatesFor`, `exportedNamesOfStatement`). The ONLY change from the
  legacy file is structural: the return type is a LOCAL `OracleModuleGraph` interface
  (identical shape) instead of the imported `ModuleGraph`, so the oracle is self-contained
  and unaffected by changes to the shared type. It is FROZEN — never edited to track the
  modern impl; its whole value is being an independent reference.
- **`src/test/equivalence.test.ts`** — runs both implementations over 13 crafted multi-file
  fixtures (a superset of the per-form characterization cases, packed into projects) and
  asserts `modern === oracle` via a structure-aware deep comparison: `imports`/`exports`
  value arrays compared **order-sensitively** (encounter order is load-bearing),
  `usedExports`/`wildcardUsed` Set members compared **order-insensitively** (Set order is
  not). A harness guard asserts at least one fixture produces non-empty edges / used /
  wildcard so an all-empty pass can't masquerade as success.
- **`src/test/buildModuleGraph.test.ts`** — 32 characterization tests that double as the
  documented behavioral spec (since none existed): relative resolution (`.ts` / `index.ts` /
  `.tsx` / `.d.ts` / `..` parent / `.js`→`.ts` & `.jsx`→`.tsx` stem-swap), bare-import
  ignoring, self-edge guard, unresolvable specifiers, edge dedup + encounter order,
  default / named-aliased / namespace / default+named imports, dynamic `import()`,
  `import = require`, `export *`, `export * as ns`, named re-export (used-on-source +
  re-export-under-exported-name), local `export {}`, exported-decl name collection
  (function/class/interface/enum/namespace/type-alias/multi-var), `export default` decl,
  `export default <expr>`, `export = x`, and the output shape (`files` order, empty entries,
  empty input).

**45 tests total** (32 + 13). Both `tsc --noEmit` and `vitest run` are green (exit 0).

---

## 4. What was NOT migrated (and why)

- **Not `Effect`-wrapped** (see D1) — pure sync function over in-memory text.
- **`ModuleGraph` not copied** — consumed read-only as a type from `@ts-doctor/rules-core-effect`.
- **No dead code** in the legacy file — every branch is live and ported; nothing dropped.

---

## 5. Follow-ups

1. **Engine wiring.** The engine collects the in-project source files (via discovery /
   `collectSourceFiles`), reads their text (a `FileSystem` concern that stays in the engine),
   calls `buildModuleGraph`, and feeds the resulting `ModuleGraph` to `runGraphRule` / the
   GRAPH rules (RULE-015 cycle detection, layering, unused-export analysis). This builder is
   the pure middle of that pipeline — it never touches disk.
2. **Bare-import ignoring is intentional** (not a gap). GRAPH rules reason about the
   project's OWN module structure; package/`node_modules` edges are out of scope, so a
   non-`.`-prefixed specifier deliberately yields no edge. Documented inline at
   `resolveSpecifier`.
3. **Structural only — no `ts.Program` / checker.** Resolution is path-string arithmetic over
   the input set, not the TS module resolver. This is faithful to legacy and sufficient for
   the GRAPH tier; if a future rule needs true resolution (paths/baseUrl/exports maps), that
   would be a deliberate, separately-scoped upgrade.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** + ESM + `.js` import specifiers + `verbatimModuleSyntax`
  tsconfig + `pnpm-workspace.yaml` `allowBuilds: esbuild` follow the established slice
  conventions (score / rules-core / type-performance).
- **`vitest.config.ts`** inlines `@ts-doctor/rules-core-effect` + `@ts-doctor/contracts-effect`
  defensively (same pattern as type-performance). In practice the only rules-core usage here
  is the `import type { ModuleGraph }` (erased at runtime), so vitest never loads its JS — but
  the inline is kept so any future value-import / transitive `.ts`-entry transpile is compiled
  by esbuild rather than failing to parse.
- **Run:** `cd modernized/module-graph/effect && pnpm test` (vitest) · `pnpm typecheck`
  (tsc). Both green: 45/45 · tsc exit 0.

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the GRAPH rules. The critic **independently diffed both the port AND the
vendored oracle against legacy** `core/src/module-graph.ts` — executable logic is byte-identical
in both, so the differential ("port === oracle") is a meaningful equivalence, not two copies of a
shared transcription bug. The deep-compare is correct (imports/exports order-sensitive;
usedExports/wildcardUsed order-insensitive). **No HIGH findings.**

**Applied:**
- **Closed the `.mjs`/`.cjs` stem-swap + `index.tsx` coverage hole (MEDIUM).** The differential's
  "relative resolution" fixture exercised `.js`/`.jsx` stem-swap + `index.ts` but NOT `.mjs`/`.cjs`
  or `index.tsx` — the one documented, load-bearing resolution branch unproven in the strongest
  (port-vs-oracle) test, on the only module with no legacy test. The fixture now imports
  `./g.mjs`→`g.ts`, `./h.cjs`→`h.tsx`, and `./sub2`→`sub2/index.tsx`, running both impls.
