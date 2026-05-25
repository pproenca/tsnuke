# Transformation Notes — `@ts-fix/contracts-effect` (contract consolidation)

A **consolidation slice**, not a behavioral rewrite. It creates the single canonical
`effect/Schema` home for the cross-cutting domain contracts that several completed
strangler-fig slices currently **VENDOR (duplicate)**. The architecture-critic flagged
this drift as the highest-value cross-cutting follow-up; the critic confirmed the
duplicates are clean structural supersets (no semantic conflict). This package is
**additive** — it introduces no edits to any existing slice.

Sources (READ-ONLY): `legacy/ts-fix/packages/ts-fix-rules/src/types.ts`
(`Diagnostic`/`Severity`/`Tier`/`FixKind`/`TextEdit`/`Fix`/`Capability`/`RuleMeta`) and
`legacy/ts-fix/packages/core/src/types.ts` (`TsFixConfig` family).
Target: `modernized/contracts/effect/`.

**Result:** 40/40 compatibility/superset tests pass · `tsc --noEmit` clean under
`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` +
`verbatimModuleSyntax`.

---

## 1. What this consolidates + WHY (the cross-cutting drift)

The same contracts were re-typed in slice after slice. Each copy was correct, but having
N copies means a contract change is an N-site edit, and the copies can silently drift.
The duplication census the critic produced:

| Contract | Duplicated in | Status here |
|----------|---------------|-------------|
| `Severity` (`error`\|`warning`) | score, filter-pipeline, build-report, capabilities (×5 incl. legacy) | canonical (`Diagnostic.ts`) |
| `Tier` (`SYN`\|`TYP`\|`GRAPH`\|`CFG`) | score, filter-pipeline, build-report, capabilities (×3+) | canonical (`Diagnostic.ts`) |
| `FixKind` (`auto-fix`\|`codemod`\|`manual`) | score, filter-pipeline, build-report (×3) | canonical (`Diagnostic.ts`) |
| `TextEdit` / `Fix` | score, filter-pipeline, build-report (×3) | canonical (`Diagnostic.ts`) |
| `Diagnostic` (all fields) | score, filter-pipeline, build-report (×3+) | canonical (`Diagnostic.ts`) |
| `Capability` (string token) | capabilities | canonical (`RuleMeta.ts`) |
| `RuleMeta` | capabilities (activation **subset**) + legacy (**full**) | canonical = FULL (`RuleMeta.ts`) |
| `TsFixConfig` family | config (full) / filter-pipeline (3-field subset) / security (bare `{plugins?}`) | canonical = FULL (`Config.ts`) |

Each canonical Schema is authored as the **FULL legacy contract**, which is a structural
superset of every vendored copy — so any slice can de-vendor by deleting its local copy
and importing from here, with no shape change at its call sites.

---

## 2. Mapping table (legacy type → canonical Schema)

| Legacy type | Legacy location | Canonical Schema |
|-------------|-----------------|------------------|
| `Severity` | `ts-fix-rules/types.ts:13` | `Diagnostic.ts` `Severity` |
| `Tier` | `ts-fix-rules/types.ts:22` | `Diagnostic.ts` `Tier` |
| `FixKind` | `ts-fix-rules/types.ts:25` | `Diagnostic.ts` `FixKind` |
| `TextEdit` | `ts-fix-rules/types.ts:28-35` | `Diagnostic.ts` `TextEdit` |
| `Fix` | `ts-fix-rules/types.ts:38-43` | `Diagnostic.ts` `Fix` |
| `Diagnostic` | `ts-fix-rules/types.ts:46-66` | `Diagnostic.ts` `Diagnostic` |
| `Capability` | `ts-fix-rules/types.ts:72` | `RuleMeta.ts` `Capability` |
| `RuleMeta` (full) | `ts-fix-rules/types.ts:98-123` | `RuleMeta.ts` `RuleMeta` |
| `TsFixConfig` | `core/types.ts:151-164` | `Config.ts` `TsFixConfig` |
| `TsFixConfig.failOn` literal | `core/types.ts:158` | `Config.ts` `FailOn` |
| `rules`/`categories` value literal | `core/types.ts:162-163` | `Config.ts` `ConfigSeverity` |
| `ignore` shape | `core/types.ts:152-157` | `Config.ts` `IgnoreConfig` |
| `ignore.overrides[]` shape | `core/types.ts:156` | `Config.ts` `IgnoreOverride` |

`legacy` interfaces → `effect/Schema` (`Schema.Struct`/`Schema.Literal`/`Schema.Int`/
`Schema.optional`). Field-for-field identical; `number` → `Schema.Int` for offsets/line/
column (matching the vendored copies, which already tightened to `Schema.Int`).

### Deliberately NOT modeled here (owned elsewhere — avoids re-vendoring)
- `ProjectInfo` — discovery owns it; being built in parallel; **not yet duplicated**.
- `Score` / `ScoreBand` / `ScoreResult` — the `score` slice owns these; not duplicated.
- `EnginePlan` — the `engine-plan` slice owns it.
- `JsonReport*` family (`JsonReportV1`/`Summary`/`ProjectEntry`/`Error`/`DiffInfo`) +
  `DiagnoseOptions`/`DiagnoseResult` — `build-report` owns these, single-site, not duplicated.
- `ModuleGraph` — GRAPH-tier input; single-site.
- `DiagnosticWithTags` — filter-pipeline's engine-only INPUT carry (tags stripped before
  the public `Diagnostic` is emitted, RULE-023). The canonical `Diagnostic` is the PUBLIC
  shape; tags stay a filter-pipeline-local extension over it.

---

## 3. Preserved quirk — `warn` (config) vs `warning` (engine/failOn), RULE-040

This is the one vocabulary subtlety that survives consolidation **unchanged**:
- `Severity` (engine) = `"error" | "warning"`.
- `ConfigSeverity` (config-file `rules`/`categories`) = `"error" | "warn" | "off"`.
- `FailOn` = `"error" | "warning" | "none"` (engine spelling, with `"none"`).

The `"warn"` vs `"warning"` split is an observable part of the contract. No normalization
happens here (it belongs downstream in filter-pipeline's `normalizeConfigSeverity`); a
`sanitizeConfig` round-trip stays byte-identical to legacy. The compat tests pin this:
`ConfigSeverity` rejects `"warning"`, `FailOn` rejects `"warn"`.

---

## 4. Compatibility-proof approach (how this package earns its keep — not ceremony)

The tests in `src/test/*.compat.test.ts` PROVE each canonical Schema is a faithful
SUPERSET of the legacy type AND of every vendored copy, so de-vendoring is provably safe:

1. **Acceptance of every in-contract shape.** For each canonical Schema we `decode` a
   representative set of values that the legacy type + each vendored copy would accept
   and assert acceptance — including the **narrower** subset shapes other slices produce:
   - `Diagnostic`: minimal required-only shape (smallest score/build-report/filter-pipeline
     accept), full-with-all-optionals, fix with empty edits, `line <= 0`, and a value
     carrying an extra `tags` key (filter-pipeline's `DiagnosticWithTags` — accepted, since
     Effect's default decode ignores excess keys).
   - `RuleMeta`: the capabilities **subset** shape (no `fixKind`/`message`/`recommendation`)
     decodes valid under the FULL canonical RuleMeta.
   - `TsFixConfig`: the empty `{}`, the FULL 6-field shape, the filter-pipeline 3-field
     subset, AND the security bare `{plugins?}` — all decode valid under the full config.
2. **Rejection of out-of-contract values.** e.g. `Severity` rejects `"info"`/`"warn"`/`"off"`;
   `Tier` rejects `"LINT"`; `Diagnostic` rejects `severity:"info"`, non-int `line`, missing
   required fields; `ConfigSeverity` rejects `"warning"`; `FailOn` rejects `"warn"`.
3. **Round-trip** `decode(encode(x)) === x` for a representative + minimal `Diagnostic`,
   `RuleMeta`, and `TsFixConfig` (`toStrictEqual`).

Sample values are constructed **inline** (we do NOT import the vendored packages): the
point is to PIN the structural-superset property, so the de-vendor later is mechanical.

> **Proof-scope caveat (architecture review M8):** these tests assert the canonical Schema
> accepts the shapes the vendored copies are *believed* to produce (reconstructed inline from
> reading each copy), NOT values decoded by the *actual* vendored Schemas. So a future DRIFT
> in a vendored copy (e.g. a slice adds a required field) would NOT be caught here — it would
> surface only when that slice de-vendors. The real cross-check therefore happens AT de-vendor
> time: each consumer's own existing test suite must stay green after switching its import to
> the canonical Schema (that is the authoritative superset proof per slice). The inline proof
> is sufficient to make de-vendoring *safe to attempt*; it is not a substitute for re-running
> the consumer's suite on the switch. (A stronger version would `file:`-import each vendored
> Schema here and round-trip a value through both — deferred to avoid a base→consumer dev-dep.)

**Test count:** 40 (`Diagnostic.compat` 18, `RuleMeta.compat` 11, `Config.compat` 11).

---

## 5. De-vendor plan (ready; NOT done in this task — avoids mass churn)

This task is **additive only**: it creates the package and its proofs. It does **not**
edit any existing slice (that would be the mass cross-cutting churn the brief explicitly
defers). When each slice is next touched, replace its local copy with an import from
`@ts-fix/contracts-effect`. The canonical version is a proven superset, so call sites
do not change shape.

| Slice | Local file to delete | Symbols to import from here | Notes |
|-------|----------------------|------------------------------|-------|
| `score` | `src/main/Diagnostic.ts` | `Diagnostic`, `Severity` (re-export the same narrow barrel it has today) | score reads only `plugin`/`rule`/`severity`; its barrel intentionally re-exports only `Diagnostic`+`Severity` — keep that public surface. |
| `filter-pipeline` | `src/main/Diagnostic.ts` + the 3 contract types in `src/main/Config.ts` | `Diagnostic`, `Severity`, `ConfigSeverity`, `IgnoreConfig`, `IgnoreOverride`, `TsFixConfig` | KEEP `DiagnosticWithTags` locally (engine-only carry over the canonical `Diagnostic`); KEEP `normalizeConfigSeverity` (its D1 normalization logic, not a contract). filter-pipeline's `IgnoreConfig` omitted `tags`; the canonical adds it (superset) — no call-site change. |
| `build-report` | `src/main/Diagnostic.ts` | `Diagnostic`, `Severity` (+ whatever its barrel currently re-exports) | build-report reads only `severity`/`filePath`; carries the rest verbatim. |
| `capabilities` | the contract types in `src/main/RuleMeta.ts` | `RuleMeta`, `Severity`, `Capability`, `Tier` | KEEP `decodeRuleMeta` re-export if convenient (also exported here). capabilities vendored the activation SUBSET; the canonical is the FULL RuleMeta (superset) — `shouldActivate`/`resolveSeverity` read only the subset fields, so no logic change. KEEP `resolveSeverity`/`shouldActivate` (predicates, not contracts). |
| `security` | the `TsFixConfig` interface in `src/main/Config.ts` | `TsFixConfig` | security vendored the bare `{plugins?}`; the canonical full config has `plugins?` as a superset — `loadConfigPlugins` reads only `plugins`, unchanged. |
| `config` | (none yet) | — | config slice authored the FULL `TsFixConfig` already; it can either re-export from here or stay the de-facto source. Recommend it import from here too, so there is exactly ONE canonical Schema. Lowest priority since it is already the full shape. |

### First NEW consumer: the engine slice
The **engine** slice (next to land) is the first consumer to import from here INSTEAD of
vendoring: `Diagnostic`, `RuleMeta`, `Capability`, `TsFixConfig` (and `Severity`/`Tier`/
`FixKind` as needed). It should add `@ts-fix/contracts-effect` as a dependency and
import the canonical Schemas directly — no new vendored copy is created.

### Sequencing note
De-vendor each slice when it is next opened for other reasons (lazy migration), not as a
big-bang. Because every canonical Schema is a proven superset, the order is unconstrained
and each migration is independently safe and reversible.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** mirrors the `score` template's convention (honored
  as written, even though co-locating `*.test.ts` is more TS-idiomatic).
- **`.js` on relative specifiers** (`../main/index.js`) per the slice convention; the
  `Bundler` moduleResolution in `tsconfig.json` resolves `.js` → `.ts`.
- **PURE contracts:** the only dependency is `effect` (for `Schema`). No `@effect/platform`,
  no Effect monad, no business logic — by design.
- **Excess-key behavior:** Effect's default `Schema.decode` ignores unknown keys, which is
  why a `DiagnosticWithTags`-shaped value (extra `tags`) decodes valid as a canonical
  `Diagnostic`. Pinned in `Diagnostic.compat.test.ts`.
- **Run:** `cd modernized/contracts/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside `discovery`. The critic **independently verified the de-vendor superset
claim against the REAL vendored copies** in `score`, `build-report`, `filter-pipeline`,
`capabilities`, and `security` — all hold (score/build-report `Diagnostic` field-identical
incl. `Schema.Int` not `Schema.Number`; filter-pipeline `IgnoreConfig` omits `tags`, canonical
adds it; capabilities `RuleMeta` is a strict subset; security's bare `{plugins?}` is
type-compatible). Confirmed Effect's default decode ignores+strips excess keys and that no
slice relies on excess-key rejection. The `warn`/`warning` quirk is preserved + pinned.
**Verdict: load-bearing infrastructure, not ceremony** — with one proof-scope caveat.

**Applied:**
- **Proof-scope caveat documented (MEDIUM M8).** §4 now states the compat tests assert against
  *inline-reconstructed* vendored shapes, not the *actual* vendored Schemas, so the real
  per-slice cross-check happens at de-vendor time (the consumer's suite staying green on the
  import switch). Qualifies the "proven superset of every vendored copy" claim honestly.

**Recorded, no change:**
- **L9 — `decode*Either` helpers have no consumer yet.** Reasonable trust-boundary
  infrastructure; the engine slice is the first caller (its untrusted rule-metadata / wire
  boundary). Named so it doesn't become permanent unused surface.
- **C1 — `Capability` first de-vendor.** It gates which rules fire → the score; it should be the
  FIRST symbol de-vendored (discovery's bare alias + capabilities' `Schema.String` → import
  from here), so exactly one definition controls the score.
