# Transformation Notes — `config` (sanitization + FS loader) → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor config effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/core/src/load-config.ts:22-196` — the
PURE `sanitizeConfig` + helpers (`:22-154`) AND the effectful loader
`tryParseJson`/`loadConfig`/`loadConfigWithWarnings` (`:156-196`) — plus the
`TsDoctorConfig` type (`packages/core/src/types.ts:151-164`). Target:
`modernized/config/effect/` (package `@ts-doctor/config-effect`).

Implements **RULE-024** (lenient config loading, drop-not-throw) **END-TO-END** over
the **RULE-040** severity-vocabulary contract, with **RULE-039** (`plugins`
retained-not-loaded) preserved:
- the PURE core (`sanitize.ts`, reviewed + final — NOT touched in this pass), and
- the EFFECTFUL filesystem loader (`loadConfig.ts`, NEW) — **the first genuinely
  effectful slice in the modernization**: it returns `Effect<...>` (unlike the pure
  `score`/`filter-pipeline`/`sanitize` slices), reads from disk through
  `@effect/platform` `FileSystem` + `Path` services, and is satisfied by a Layer at
  the edge (`NodeFileSystem`/`NodePath` in prod; an in-memory stub in tests).

Verified by **170** characterization tests: the **135** pre-existing pure-core tests
(unchanged) — including the differential equivalence proof against a vendored frozen
copy of legacy `sanitizeConfig` over **2235** fixtures (75 hand + 2160 combinatorial)
plus the pinned D-sparse divergence — and **35 NEW** loader tests (19 characterization
+ 16 differential fixtures vs a frozen legacy `loadConfigWithWarnings`+`tryParseJson`
oracle), almost all on a stub in-memory FileSystem Layer (NO real disk), plus **2
production-Layer tests** that exercise `NodeContext` (real `NodeFileSystem`/`NodePath`)
against an OS temp dir (added in review).

**Result:** 170/170 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `load-config.ts` | Target |
|----------|-------------------------|--------|
| `TsDoctorConfig` contract (RULE-040 vocab) | `types.ts:151-164` (`interface`) | `src/main/Config.ts` (`effect/Schema`: `TsDoctorConfig`, `IgnoreConfig`, `IgnoreOverride`) |
| Config severity vocab `error`/`warn`/`off` (RULE-040) | `:30` `SEVERITY_WORDS` | `src/main/Config.ts:36` `ConfigSeverity` (`Schema.Literal`) |
| `failOn` engine vocab `error`/`warning`/`none` (RULE-040 quirk) | `:120-122` inline `===` | `src/main/Config.ts:46` `FailOn` (`Schema.Literal`) |
| `isObject` guard | `:22-24` | `src/main/sanitize.ts` `isObject` (kept hand-rolled — see D2) |
| `isStringArray` guard | `:26-28` | `Schema.Array(Schema.String)` decode (`sanitize.ts` `asStringArray`) — D1 |
| `sanitizeSeverityMap` (RULE-024/040) | `:32-51` | `src/main/sanitize.ts` `sanitizeSeverityMap` (+ `decodeConfigSeverity`) |
| `sanitizeIgnore` (RULE-024) | `:53-96` | `src/main/sanitize.ts` `sanitizeIgnore` |
| `sanitizeConfig` (RULE-024) | `:104-154` | `src/main/sanitize.ts` `sanitizeConfig` |
| `plugins` retained-not-loaded (RULE-039) | `:138-145` | `src/main/sanitize.ts` (plugins branch) + `Config.ts` doc |
| `LoadConfigResult` | `:17-20` (`config` + `warnings: string[]`) | `SanitizeResult` (`config` + `warnings: ReadonlyArray<string>`) — D3 |
| `tryParseJson` (read + `JSON.parse`, catch→`undefined`) | `:156-162` | `src/main/loadConfig.ts` `tryParseJson` — `fs.readFileString` + `Either.try(JSON.parse)`; both `PlatformError` and a parse throw → `undefined` (error channel `never`) |
| `loadConfigWithWarnings` (file selection + fallback, RULE-024) | `:174-196` | `src/main/loadConfig.ts` `loadConfigWithWarnings` — `Effect.gen` over `FileSystem` + `Path` |
| `loadConfig` (= `…WithWarnings(dir).config`) | `:169-171` | `src/main/loadConfig.ts` `loadConfig` — `Effect.map(r => r.config)` |
| `existsSync` / `readFileSync` (`node:fs`) | `:12,176,188` | `@effect/platform` `FileSystem.exists` / `FileSystem.readFileString` (service, not `node:fs`) |
| `join` (`node:path`) | `:13,175,187` | `@effect/platform` `Path.join` (service, not `node:path`) |
| production fs wiring | (ambient `node:fs`/`node:path`) | `NodeContext = Layer.merge(NodeFileSystem.layer, NodePath.layer)` + `loadConfig{,WithWarnings}Node` runnable helpers |

The legacy `sanitizeConfig`/`loadConfigWithWarnings` returned
`{ config: TsDoctorConfig; warnings: string[] }`; the target returns
`{ config: TsDoctorConfig; warnings: ReadonlyArray<string> }` (`SanitizeResult`).

---

## 2. Deviations from legacy behavior

**One deliberate divergence (sparse arrays); otherwise byte-for-byte.** On every
input the real pipeline produces, `sanitizeConfig` is a faithful port: the
differential asserts `{ config, warnings }` deep-equal to the legacy oracle —
**warning order included** — across 2235 fixtures with **0 divergences**. The ONE
exception is **D-sparse** below (sparse arrays, which `JSON.parse` never yields). The
remaining deviations (D1–D5) are internal / type-level and non-observable.

### D-sparse — Sparse arrays rejected (deliberate hardening; the ONE observable divergence) ⚠
Legacy `isStringArray` uses `Array.prototype.every`, which SKIPS holes, so a sparse
array (`["a", <hole>]`) is accepted verbatim — keeping an `undefined` hole as if it
were `string[]`. The target's `asStringArray` decodes via `Schema.Array(Schema.String)`,
which REJECTS the hole and drops the field with the standard warning. This is the ONLY
input class where modern ≠ legacy; it is a deliberate HARDENING (a holed array is not a
valid `string[]`). `JSON.parse` NEVER yields holes, so the deferred FS path is
unaffected — but `sanitizeConfig(raw: unknown)` is a public pure function, so the
divergence is pinned + documented by `equivalence.test.ts` ("D-sparse"), keeping the
differential's "0 divergences" claim honest about its one exception (architecture review).

### D1 — Leaf validation via `effect/Schema` decode-with-fallback (idiom, internal)
Legacy hand-rolled `isStringArray` and literal `===` checks. The target runs each
candidate through `Schema.decodeUnknownEither(<schema>)` and branches on
`Either.isRight`/`isLeft` (`sanitize.ts`): `StringArray = Schema.Array(Schema.String)`,
`Schema.Boolean`, `FailOn`, `ConfigSeverity`. This is the **decode-with-fallback**
pattern the brief asks for (Schema models the contract, RULE-040) — wrapped so the
per-field **drop-with-warning semantics and verbatim messages** (the actual
contract) are reproduced exactly. Same inputs → same outputs.

### D2 — `isObject` kept hand-rolled (deliberate, non-observable)
The "plain object" check (`typeof === "object" && !== null && !Array.isArray`) is
NOT expressed as a Schema. Reason: legacy's "an array is NOT a config object" /
"an array is NOT a severity map" behavior (`{ ignore: [...] }` →
`Dropping "ignore": expected an object.`) is a structural predicate, not a decode;
`Schema.Object`/`Schema.Record` accept arrays differently, and routing it through
Schema would risk drifting the exact drop-set. Kept verbatim from legacy `:22-24`.

### D3 — `string[]` → `ReadonlyArray<string>` on the result (type narrowing)
`SanitizeResult.warnings` is `ReadonlyArray<string>` (was `string[]`); the config's
array fields are `ReadonlyArray` (from `Schema.Array`). Purely a type tightening —
the runtime values are identical and `toStrictEqual` against the mutable-typed
oracle passes.

### D4 — `sanitizeConfig` stays a PURE synchronous function (NOT `Effect`-wrapped)
Deliberate, matching the established pure-slice pattern (`score`, `filter-pipeline`):
the Effect ecosystem appears in the **contract** (`Schema`, `TsDoctorConfig`) and the
**decode helpers**, not by wrapping the validation in a fiber. `sanitizeConfig` does
no I/O, so there is no effect to model — wrapping it would buy nothing.

### D5 — `TsDoctorConfig` is the FULL legacy contract (Schema), superseding the vendored subset
`Config.ts` models all six legacy fields (`ignore`/`failOn`/`customRulesOnly`/
`plugins`/`rules`/`categories`). The `filter-pipeline` slice vendored a 3-field
subset (`Config.ts` there: `ignore`/`rules`/`categories`). This slice is the
intended owner of the full contract; the filter-pipeline subset should de-vendor
onto it (Follow-up #2). Naming is kept consistent with that slice (`ConfigSeverity`,
`TsDoctorConfig`, `IgnoreConfig`, `IgnoreOverride`) to make the de-vendor mechanical.

---

## 3. The filesystem loader — the FIRST effectful slice (was deferred, now DONE)

Legacy `loadConfig` / `loadConfigWithWarnings` / `tryParseJson`
(`load-config.ts:156-196`) read from disk (`existsSync` + `readFileSync` +
`JSON.parse`, trying `tsdoctor.config.json` then `package.json#tsDoctor`). The pure
slice (previous pass) deferred this; **it is now implemented** in
`src/main/loadConfig.ts` and completes RULE-024 end-to-end. This is the FIRST slice
that returns an `Effect<...>` rather than a plain value — `score`, `filter-pipeline`,
and `sanitize` are all pure. The Layer/service pattern established here is the one the
later effectful slices (engine, discovery) reuse for ALL file reads.

### 3.1 The `Effect` shape (error channel `never`)
```
loadConfigWithWarnings(dir): Effect<SanitizeResult, never, FileSystem.FileSystem | Path.Path>
loadConfig(dir):            Effect<SanitizeResult["config"], never, FileSystem.FileSystem | Path.Path>
```
- **Requirements channel** declares the two `@effect/platform` services the loader
  needs (`FileSystem`, `Path`). The loader does NOT import `node:fs`/`node:path`; it
  depends on the service *interfaces* and is satisfied by a Layer at the edge. This is
  the inversion the Modernization Brief routes all reads through.
- **Error channel is `never`** — RULE-024 NEVER throws. Every `PlatformError` is
  mapped to the exact fallback legacy produced from `existsSync` returning `false` /
  `tryParseJson` catching: `fs.exists(p)` failing → treated as "absent"
  (`Effect.orElseSucceed(() => false)`); `fs.readFileString` failing → treated as
  unreadable (`Effect.orElseSucceed(() => undefined)`, then the parse-fail path); a
  `JSON.parse` throw → captured by `Either.try` → `undefined`. So a `PlatformError`
  can NEVER escape the loader — it always resolves to a `SanitizeResult`.
- **All validation is DELEGATED** to the pure `sanitizeConfig` (`./sanitize.js`) — the
  loader only decides WHICH file (if any) to read and how to parse it. The reviewed +
  final pure sanitizer was **NOT touched** (`Config.ts`/`sanitize.ts` unchanged).

### 3.2 The Layer pattern — two implementations of the same two services
The loader is wired to a concrete filesystem ONLY at the edge, via a `Layer`:
- **Production** — `NodeContext = Layer.merge(NodeFileSystem.layer, NodePath.layer)`
  from `@effect/platform-node`. The runnable convenience helpers `loadConfigNode(dir)`
  / `loadConfigWithWarningsNode(dir)` `Effect.provide(NodeContext)` then
  `Effect.runPromise` — returning a `Promise<SanitizeResult>` that NEVER rejects
  (RULE-024 is total). `@effect/platform-node` is referenced in this ONE place only;
  the loader stays platform-agnostic.
- **Tests** — a tiny in-memory stub Layer (see §3.3). Because both production and tests
  satisfy the *same* `FileSystem | Path` requirements, swapping disk for an in-memory
  map is a one-line Layer change with zero loader changes. This is the payoff of
  modeling I/O as services.

### 3.3 The stub-FileSystem-Layer test approach (NO real disk)
`src/test/loadConfig.test.ts` runs the loader entirely in memory:
- `stubFsLayer(files: Map<path, contents>)` = `FileSystem.layerNoop({...})` — a
  platform helper that builds a `Layer<FileSystem>` whose methods are no-ops EXCEPT the
  ones we override. The loader only calls `exists` + `readFileString`, so those are the
  only two implemented: `exists` → `files.has(path)`; `readFileString` → `files.get` or
  `Effect.fail(new SystemError({ reason: "NotFound", … }))` (from
  `@effect/platform/Error`) so the loader's `PlatformError → fallback` mapping is
  exercised too.
- `Path` is the REAL platform-agnostic `Path.layer` — `join` is a pure string op (no
  I/O), so using it (not a stub) proves the loader's path-joining matches `node:path`
  semantics, which is part of the legacy contract. On this POSIX test host that yields
  POSIX joins; the in-memory map keys are POSIX absolute paths to match.
- `testLayer(files) = Layer.merge(stubFsLayer(files), Path.layer)` satisfies the full
  requirement; tests `Effect.provide(testLayer(...))` then `Effect.runPromise`.
- (`@effect/vitest` is back in devDeps for ergonomic `Effect` testing; the suite here
  is plain `vitest` + `Effect.runPromise` since each case asserts a single resolved
  value — both styles work. The equivalence section uses plain `vitest`.)

### 3.4 What is verified
16 characterization cases (config-present valid/malformed/unparseable/non-object;
package.json fallback present/absent/non-object/unparseable/malformed-tsDoctor; neither
present; config.json-over-package.json precedence incl. unparseable-still-wins;
`loadConfig` config-only projection; `PlatformError`→fallback for both `exists` and
`readFileString`) + a 16-fixture **differential equivalence proof**: a frozen vendored
copy of legacy `loadConfigWithWarnings`+`tryParseJson` parameterized over a fake
`{ existsSync, readFileSync }` backed by the SAME map (and calling the SAME pure
`sanitizeConfig`), asserted `toStrictEqual` the modern (stub-FS Layer) result. This
isolates and proves the file-selection / fallback / parse-error logic — the only thing
this slice adds over the already-proven pure core. **0 divergences.** The warning text
`Ignoring ${configPath}: could not parse as JSON.` and the `${configPath}` format are
preserved verbatim.

- **No dead code dropped:** every line of legacy `load-config.ts` (pure `:22-154` AND
  loader `:156-196`) is now live and migrated. Nothing was discarded.
- **Consumers untouched** (out of scope for this surgical slice): legacy
  `index.ts:170-175` (which normalizes `warn`→`warning` and applies overrides) and the
  call sites of `loadConfig`. See Follow-ups.

---

## 4. Follow-ups for the next module(s)

1. ~~**Implement the FS loader over `@effect/platform` FileSystem (Effect + Layer).**~~
   **DONE** (this pass) — `src/main/loadConfig.ts`. Port of
   `loadConfigWithWarnings`/`loadConfig`/`tryParseJson` (`load-config.ts:156-196`) as
   `Effect<SanitizeResult, never, FileSystem.FileSystem | Path.Path>`, delegating to
   the pure `sanitizeConfig`, with `NodeContext` (prod) + stub in-memory (test) Layers.
   See §3. The engine/discovery slices should REUSE this Layer/service pattern (and can
   reuse `NodeContext` itself) for their own file reads rather than re-introducing
   `node:fs`/`node:path`.

2. **De-vendor `TsDoctorConfig` (D5).** The `filter-pipeline` Effect slice
   (`modernized/filter-pipeline/effect/src/main/Config.ts`) vendored a 3-field
   subset and its own TRANSFORMATION_NOTES Follow-up #2 says to de-vendor onto the
   core config slice. When both slices share a workspace, delete that subset and
   import `TsDoctorConfig` / `ConfigSeverity` / `IgnoreConfig` / `IgnoreOverride`
   from `@ts-doctor/config-effect`. (Naming is already aligned to make this
   mechanical.) Note: the filter-pipeline subset omits `ignore.tags`; the full
   contract here includes it, so the de-vendor is a superset — safe.

3. **Reconcile the `warn`↔`warning` vocab END-TO-END (RULE-040).** `sanitizeConfig`
   deliberately keeps the config vocab (`"warn"`) VERBATIM (D-none — it's legacy
   parity). The single normalization point is the filter-pipeline slice's
   `normalizeConfigSeverity` (its deviation D1), which maps `"warn"`→`"warning"` in
   ONE place. End-to-end, the flow is: `sanitizeConfig` (config vocab in/out) →
   filter-pipeline severity stage (`normalizeConfigSeverity`, config→engine vocab).
   When wiring the engine, ensure `config.rules`/`config.categories` from THIS slice
   feed the filter-pipeline severity stage and are normalized there, NOT a second
   time — that two-place normalization is the exact RULE-040 trap the rewrite must
   collapse. Keep `failOn`'s `"warning"` spelling as-is (it is already engine vocab;
   it feeds the exit-code gate, RULE-030, not the severity remap).

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (consistent with the `score` slice). A more TS-idiomatic layout would
  co-locate `*.test.ts` beside sources; not changed, to respect the convention.
- **`.js` relative specifiers** on a TS source tree (e.g. `from "./Config.js"`):
  the `Bundler` moduleResolution in `tsconfig.json` resolves `.js` → `.ts`,
  matching the legacy convention and the `score` slice.
- **`pnpm-workspace.yaml` `allowBuilds: { esbuild: true }`** approves esbuild's
  prebuilt-binary install script so pnpm 11 doesn't skip it (vitest needs esbuild).
- **Pinned toolchain:** `effect@^3.21.2`, `vitest@^3.2.0`, `typescript@^5.8.0`,
  `@types/node@^22.10.0`. ESM (`"type": "module"`).
- **Effectful-slice deps added (this pass):** `@effect/platform@^0.96.1` (the
  `FileSystem`/`Path` service interfaces — a runtime `dependency`),
  `@effect/platform-node@^0.106.0` (the prod `NodeFileSystem`/`NodePath` Layers — a
  `dependency`, referenced ONLY in `loadConfig.ts`'s `NodeContext`), and
  `@effect/vitest@^0.29.0` (devDep, back now that there are real `Effect<…>` values to
  test). Versions resolved via `npm view` against `effect@^3.21.2` (each declares peer
  `effect: ^3.21.x`). `@effect/platform-node` pulls optional transitive native deps
  (`@parcel/watcher`, `msgpackr-extract`) whose install scripts pnpm 11 skips
  (`ERR_PNPM_IGNORED_BUILDS`) — NEITHER is needed by `NodeFileSystem`/`NodePath`, so
  the skip is harmless (no `pnpm approve-builds` required for this slice).
- **Run:** `cd modernized/config/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Equivalence proof summary

- **Oracle:** vendored frozen copy of legacy `sanitizeConfig` + helpers
  (`load-config.ts:22-154`) in `src/test/equivalence.test.ts`. Read-only intent —
  it reproduces legacy, it is not "fixed".
- **Fixtures:** 75 hand-authored (nullish/non-object raw; each field valid +
  invalid; vocab quirk; `plugins` retained; overrides good/bad; multi-drop
  accumulation; full round-trips) + 2160 combinatorial (cartesian product of
  per-field value choices).
- **Assertion:** for every fixture, `modern` deep-equals `oracle` for both `config`
  and `warnings` — **warning order included** (legacy field-traversal order:
  `ignore → failOn → customRulesOnly → plugins → rules → categories`, and per-key
  order within `rules`/`categories`/`overrides`).
- **Result:** 0 divergences across the 2235-fixture grid. The single documented
  exception — sparse arrays (D-sparse) — is pinned by a SEPARATE test (modern hardens:
  drops+warns; legacy keeps the hole) and is excluded from the grid because modern ≠
  legacy there by design. `JSON.parse` never produces holes, so the real path is
  unaffected.

---

## 7. Architecture review (consolidated, `architecture-critic`)

### 7a. Pure-core review (batch 2 — alongside `errors`/`capabilities`/`security`)
The critic re-ran the suite + typecheck and verified the vocab quirk and the verbatim
warning messages/order.

**Applied:**
- **D-sparse pinned (HIGH).** The differential asserted `divergences === 0` while a real
  divergence (sparse arrays: `Schema.Array(String)` rejects holes vs legacy `.every`
  skipping them) sat just outside the grid — a green check that over-claimed coverage.
  Now pinned by a dedicated test + documented as a deliberate hardening (above), and the
  "byte-for-byte" claim is qualified.

**Recorded (cross-cutting consolidation — the highest-value follow-up):**
- **Contract drift across slices (MEDIUM).** `TsDoctorConfig` now exists in 3 forms
  (this full Schema; the `filter-pipeline` 3-field subset; a bare `{plugins?}` interface
  in `security`), plus `Severity` (×5) and `Diagnostic`/`Tier`/`FixKind` (×3) copies.
  The critic confirmed they are clean structural supersets (no semantic conflict), so
  de-vendoring is mechanical — but the copy count is growing. **Recommendation:** land a
  shared `@ts-doctor/contracts-effect` package (or designate `config-effect` +
  `score-effect` as canonical homes) and have future slices import rather than vendor,
  before more copies accrue. Tracked in Follow-up #2.

### 7b. FS-loader review (batch 3 — alongside `engine-plan`/`scale`)
The critic verified the `PlatformError`→`never` mapping is faithful to legacy (`exists`
fail → absent; `readFileString` fail → unparseable→warning; `JSON.parse` throw →
undefined), the precedence + verbatim warning text, that the stub layer is legit and no
test touched real disk, and that `@parcel/watcher`/`msgpackr-extract` (ignored native
builds pulled in by `@effect/platform-node`) are genuinely unused.

**Applied:**
- **Production-Layer test added (HIGH).** The `NodeContext` prod path (`loadConfigWithWarningsNode`)
  was exported but never exercised — the whole point of the first effectful slice is the
  Layer wiring every later slice copies, and it was proven only by prose. Added 2 tests
  that run `loadConfigWithWarningsNode` against a real OS temp dir (read+sanitize a config;
  empty dir → never rejects), with cleanup.
- **posixJoin oracle-drift guard (MEDIUM).** The equivalence oracle joins paths with a
  hand-rolled `posixJoin`; added a guard asserting it reproduces the loader's real
  `Path.join` for the two probed files, so a `posixJoin` bug can't make both sides agree on
  a wrong key.
- **Dropped unused `@effect/vitest` devDep (LOW).** The loader tests use plain `vitest` +
  `Effect.runPromise` (each asserts a single resolved value); the dep was declared but
  unused (the `score`-slice barrel/dep-hygiene lesson). `scale` keeps `@effect/vitest` —
  it genuinely needs `it.effect`/`it.scoped` for Scope/interruption tests.
