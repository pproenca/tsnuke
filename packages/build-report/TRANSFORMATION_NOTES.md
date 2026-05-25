# Transformation Notes — `build-report` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke build-report effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/core/src/build-report.ts` (124 lines)
\+ the report types from `packages/core/src/types.ts` (`JsonReportV1` family) and
the `Diagnostic` contract from `packages/tsnuke-rules/src/types.ts`.
Target: `modernized/build-report/effect/`.

This is a **true strangler-fig**: the slice CONSUMES the already-completed `score`
slice (`@tsnuke/score-effect`) for the monorepo MIN score (RULE-003) and the
band label (RULE-002) — it does not re-derive scoring. The `score` slice is DONE
and was NOT modified.

Implements **RULE-004** (summary counts & rollup) and **RULE-034** (schema version
& `ok`), consuming **RULE-003** (monorepo MIN) from the score slice. Verified by 67
characterization tests including a structural differential equivalence proof
(modern report === legacy report) over 12 crafted multi-project fixtures + 10
serializeError cases + 2 pinned out-of-domain divergence cases (D2).

**Result:** 67/67 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

**`file:` dependency import path:** the `file:../../score/effect` dependency
imports cleanly via the package name `@tsnuke/score-effect` (`buildReport.ts`).
Vitest transpiles the `.ts`-entry dependency at test time via
`vitest.config.ts → test.server.deps.inline: ["@tsnuke/score-effect"]`. The
relative-import fallback (`../../../score/effect/src/main/index.js`) was NOT needed
— the `file:` package-name import runs green.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `build-report.ts` | Target |
|----------|--------------------------|--------|
| `JSON_REPORT_SCHEMA_VERSION = 1` (RULE-034) | `:24` | `src/main/Report.ts:24` |
| `serializeError` cause-chain flatten, root-last (RULE-034) | `:50-61` | `src/main/serializeError.ts:22-32` |
| `summarize` counts + rollup (RULE-004) | `:63-85` | `src/main/buildReport.ts:summarize` |
| └ error/warning OCCURRENCE split (structural) | `:71-74` | `buildReport.ts` `=== "error"` loop |
| └ `affectedFileCount` = distinct filePath set | `:70,74,78` | `buildReport.ts` `Set<string>` |
| └ `totalDiagnosticCount` = OCCURRENCES | `:80` | `buildReport.ts` `allDiagnostics.length` |
| └ `summary.score` = monorepo MIN (RULE-003) | `:81,104` | consumes score slice `summarizeMonorepoScore` |
| └ `summary.scoreLabel` (band, only when score≠null) | `:82` | `buildReport.ts` `band`→`scoreLabel` map |
| └ `summary.scorePartial` = OR over projects | `:83,107` | `buildReport.ts` `.some(p => p.scorePartial)` |
| `buildReport` assembly (RULE-034) | `:93-124` | `src/main/buildReport.ts:buildReport` |
| └ `ok = (error === null)` | `:114` | `buildReport.ts` |
| └ flat `diagnostics` union | `:103,118` | `buildReport.ts` `.flatMap` |
| └ `diff = input.diff ?? null` (RULE-033) | `:117` | `buildReport.ts` |
| └ carry mode/version/directory/projects/elapsed | `:94-122` | `buildReport.ts` |
| `JsonReportV1` + sub-types (wire shape) | `types.ts:63-120` (interfaces) | `src/main/Report.ts` (`effect/Schema`) |
| `Diagnostic` input contract | `tsnuke-rules/types.ts:46-66` | `src/main/Diagnostic.ts` (`effect/Schema`) |
| RULE-003 monorepo MIN | (legacy `score.ts:83-92`) | **consumed** from `@tsnuke/score-effect` |
| RULE-002 band label | (legacy `score.ts:72-76`) | **consumed** from `@tsnuke/score-effect` |

---

## 2. Deliberate deviations from legacy behavior

### D0 — NO numeric deviation (unlike the `score` slice) ✅
The `score` slice has a human-approved half-up → half-even rounding deviation.
**This slice has no rounding deviation.** `build-report` MINs per-project scores that
are *already rounded integers*; the half-even change lives only in score *computation*,
which this slice does not perform. The equivalence proof expects **100% structural
equality** with legacy over all in-domain fixtures — confirmed. (The one out-of-domain
edge — per-project scores outside `[0,100]` — is a deliberate, pinned divergence; see D2.)

### D1 — `band` → `scoreLabel` WIRE mapping (RULE-034 wire compat) ⚠
The consumed score slice's `ScoreResult`/label field is named **`band`** (a
literal union `"Great" | "Needs work" | "Critical"`). The report wire field is
**`scoreLabel`** (`JsonReportSummary.scoreLabel`, `Report.ts`). The builder MAPS
`band` → the `scoreLabel` wire field (`buildReport.ts summarize`). The wire field
name is KEPT as `scoreLabel` for report-consumer compatibility (RULE-034) even
though the modern score module calls it `band`. The label *values* are byte-identical.

### D2 — `number | null` per-project score → `Option<Score>` bridge (idiomatic Effect)
The legacy per-project `score: number | null` is bridged at the trust boundary
into the score slice's `Option<Score>` API:
`Option.fromNullable(n).pipe(Option.flatMap(decodeScore))` (`buildReport.ts toScoreOption`),
fed to `summarizeMonorepoScore`, then `Option.getOrNull` for the wire `score` and
`Option.match`/`scoreLabel` for the wire `scoreLabel`. `null` (unscored) collapses
to `Option.none()` and is skipped by the MIN — exactly as legacy's `null`-skipping.
- **Edge note (deliberate divergence, now PINNED):** `decodeScore` also rejects a
  non-integer or out-of-`[0,100]` per-project score (→ `none`, skipped), where legacy
  would have blindly MINed the raw number. On the real domain this never fires —
  per-project scores come from `computeScore` ∈ `[0,100]` — so the bridge is equivalent
  for all in-domain inputs. The out-of-domain divergence is now a PROVEN decision,
  pinned by `equivalence.test.ts` ("RULE-004 / D2 — out-of-range … skipped": a negative
  score is skipped here but MINed by legacy). The cleaner long-term fix is to tighten
  the input contract to `Score | null` so the type system forbids the case (Follow-up #6).

### D3 — `JsonReportV1` family + `Diagnostic` as `effect/Schema` (wire contract)
The report shape is modeled as `effect/Schema` (`Report.ts`) per the Modernization
Brief (line 92 — versioned wire schema is explicitly wanted). This gives consumers
a single `Schema.decode`/`Schema.encode` gate and a generable JSON Schema.
`schema.test.ts` proves the Schema models the real builder output (encode +
decode-round-trip). `Diagnostic` is likewise an `effect/Schema` (`Diagnostic.ts`),
mirroring the score slice. The pure builder functions do NOT decode on the hot path
(kept pure & fast, per the architecture-critic caveat).

---

## 3. What was NOT migrated (and why)

- **`buildReport` / `summarize` / `serializeError` stayed plain, synchronous, pure
  functions — NOT `Effect`-wrapped.** Deliberate (Brief line 91 + line 25
  architecture-critic caveat): deterministic record-building over an in-memory
  diagnostic set buys nothing from a fiber. Effect appears only in the wire contract
  (`effect/Schema`) and the consumed score slice's `Option<Score>` bridge.
- **No dead code in `build-report.ts`** — every line is live; nothing was dropped.
- **The `--diff`/`--staged` mode is carried but its file-selection is a STUB
  (RULE-033 confirmed defect).** This slice faithfully carries `mode` and `diff` as
  legacy does; it does NOT fix the missing diff/staged file narrowing (the scan is
  still full-tree, mislabeled). Out of scope — see Follow-ups.
- **Consumers were not touched** (out of scope for this surgical slice):
  `core/index.ts` and `commands/inspect.ts` (which construct `BuildReportInput` and
  pick the `mode`). See Follow-ups.
- **`Diagnostic` `Fix`/`TextEdit`/`Tier` schemas** are vendored in `Diagnostic.ts`
  for a faithful contract even though the builder reads only `severity` + `filePath`.
  They cost nothing at runtime (no decode on the hot path).

---

## 4. Follow-ups for the next module(s)

1. **De-vendor the report types.** `JsonReportV1` & family (`Report.ts`) are owned
   by `@tsnuke/core`. When the core Effect slice lands, move these schemas there
   and import them; delete the local copy.
2. **De-vendor `Diagnostic` — DONE.** The local `src/main/Diagnostic.ts` was DELETED;
   the slice now imports the canonical `Diagnostic`/`Severity` from
   `@tsnuke/contracts-effect` — `Report.ts` imports the `Diagnostic` Schema VALUE
   (`Schema.Array(Diagnostic)`), `buildReport.ts` imports the type, and the barrel
   re-exports `Diagnostic` + `Severity` as before. The canonical Schema is field-identical
   (incl. `Schema.Int`) to the deleted copy, so the suite stayed green (67/67) with no
   assertion change. Direct dep
   `@tsnuke/contracts-effect": file:../../contracts/effect` added (alongside the
   existing `score-effect` dep, which now also imports contracts); `vitest.config.ts`
   inlines both score-effect and contracts-effect.
3. **Migrate the callers** `core/index.ts` and `commands/inspect.ts:62` onto this
   module. `inspect.ts` picks `mode = staged ? "staged" : diff ? "diff" : "full"`
   (RULE-033) and assembles `BuildReportInput`; `core/index.ts` builds the
   per-project entries. When migrating, keep mapping the score slice's `band` → the
   `scoreLabel` wire field (RULE-034) and bridge `number | null` scores with
   `Option.fromNullable(n).pipe(Option.flatMap(decodeScore))` (RULE-003).
4. **`--diff`/`--staged` file selection is stubbed (RULE-033 defect).** The mode
   label is set but no changed-file narrowing is wired; `diff` is always `null`
   outside an explicitly-passed value, and the scan is full-tree. A future slice
   must wire actual diff/staged file selection — this slice only preserves the
   existing (mislabeled) behavior, it does not fix it.
5. **Keep the two RULE-004 counting semantics SEPARATE.** `summary.score` is over
   DISTINCT rules (RULE-001, in the score slice); `totalDiagnosticCount` is over
   OCCURRENCES (here). They are not interchangeable; any future refactor must not
   collapse them. Pinned by `summary.test.ts`.
6. **Tighten the per-project score contract to `Score | null`.** `BuildReportProject.score`
   is currently `number | null`, so the `decodeScore` bridge silently skips an
   out-of-`[0,100]` value (the D2 divergence). Typing it `Score | null` (the score
   slice's branded type) would forbid the out-of-domain case at compile time and let the
   bridge drop `decodeScore` for a plain `Option.fromNullable` — removing the divergence
   by construction (architecture review).

---

## 5. Toolchain / housekeeping notes

- **`file:` workspace dependency:** `package.json` declares
  `"@tsnuke/score-effect": "file:../../score/effect"`. `pnpm install` links it;
  the package-name import (`from "@tsnuke/score-effect"`) resolves to the score
  slice's `src/main/index.ts` (its `exports` entry). The relative-import fallback
  was NOT needed.
- **Vitest `.ts`-dependency transpile:** `vitest.config.ts` sets
  `test.server.deps.inline: ["@tsnuke/score-effect"]` so esbuild compiles the
  dependency's TypeScript at test time (otherwise Vitest tries to load the `.ts`
  entry as pre-built and fails to parse it).
- **`pnpm-workspace.yaml`** approves the `esbuild` build (vitest needs it), matching
  the score slice.
- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (same as the score slice).
- **Run:** `cd modernized/build-report/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (67 tests)

| File | Tests | Covers |
|------|-------|--------|
| `summary.test.ts` | 15 | RULE-004: error/warning split, distinct-file count, occurrences-vs-distinct-rules (pinned to differ), MIN score, band→scoreLabel presence/absence, scorePartial OR, empty |
| `buildReport.test.ts` | 14 | RULE-034: schemaVersion=1, ok=(error===null); RULE-004 flat diagnostics union; RULE-033 mode/diff carry; scalar/project carry |
| `serializeError.test.ts` | 11 | RULE-034: plain/named Error, deep cause chain (root-last), non-Error-cause termination, non-Error inputs |
| `equivalence.test.ts` | 25 | THE PROOF — modern === legacy (vendored oracle) over 12 multi-project fixtures + 10 serializeError cases; 100% structural equality on the real domain. Plus 2 PINNED out-of-domain divergence cases (D2, where modern ≠ legacy by design). |
| `schema.test.ts` | 2 | RULE-034: the `effect/Schema` models real builder output (encode + decode round-trip) |

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `exit-code` and `filter-pipeline` slices. **No HIGH findings.**
The critic independently re-ran the suite + typecheck and verified the `Option<Score>`
bridge for score `0` (kept) and `null` (skipped), the `band`→`scoreLabel` wire mapping,
the two RULE-004 counting semantics, and the `serializeError` root-last ordering.

**Applied:**
- **D2 out-of-range divergence pinned (MEDIUM).** The `decodeScore` bridge silently
  skips out-of-`[0,100]` per-project scores where legacy MINs them — previously an
  unproven footnote. Now pinned by two dedicated tests + documented as a deliberate
  decision (D2), with the `Score | null` contract tightening recorded as Follow-up #6.
- **Dropped a needless per-project diagnostics spread copy (LOW)** — `flatMap((p) => [...p.diagnostics])`
  → `flatMap((p) => p.diagnostics)` (`buildReport.ts`); behavior-identical, one fewer
  allocation per project.

**Recorded, no change:** modeling the whole `JsonReportV1` family as `effect/Schema` is
justified here (Brief line 92; `schema.test.ts` makes it load-bearing via a real
round-trip) — keep it. The `Report.ts` "single-arm union keyed on schemaVersion" comment
is aspirational (it's a `Struct`, not a `Union`) — harmless doc/code drift.
