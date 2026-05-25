# Transformation Notes — `filter-pipeline` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke filter-pipeline effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/core/src/filter-pipeline.ts` (218 lines)
(+ the `Diagnostic`/`Severity` contract from `packages/tsnuke-rules/src/types.ts`
and the `TsNukeConfig` subset from `packages/core/src/types.ts`). Target:
`modernized/filter-pipeline/effect/` (package `@tsnuke/filter-pipeline-effect`).

Implements **RULE-023** (four-stage diagnostic filter), **RULE-040** (config
severity vocabulary & precedence), and the `warn`→`warning` vocab of **RULE-024**.
Verified by **115 characterization tests** including a **34-fixture differential
equivalence proof** against a vendored, frozen copy of the legacy pipeline.

**Result:** 115/115 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.

Unlike the `score` slice, **this transform has NO intended behavioral deviation** —
output is 100% identical to legacy. The single change is STRUCTURAL: consolidating
the `warn`↔`warning` vocabulary (D1), which must not (and does not) change outputs.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `filter-pipeline.ts` | Target |
|----------|-----------------------------|--------|
| Frozen auto-suppress tag set `{test-noise}` (RULE-023 S1) | `:22` `AUTO_SUPPRESS_TAGS` | `src/main/stages.ts` `AUTO_SUPPRESS_TAGS` |
| `DiagnosticWithTags` (engine-only `tags` carry) | `:25-28` | `src/main/Diagnostic.ts` `DiagnosticWithTags` (Schema) |
| `SourceTextMap` / `FilterPipelineOptions` | `:31, 34-39` | `src/main/stages.ts` `SourceTextMap` / `runFilterPipeline.ts` `FilterPipelineOptions` |
| `Stage` type | `:42` | `src/main/stages.ts` `Stage` |
| `warn`/`error`/`off` → canonical normalization (RULE-040) | `:44-49` `normalizeSeverity` | `src/main/stages.ts` `normalizeConfigSeverity` (single place — D1) |
| Stage 1 auto-suppress (RULE-023 S1) | `:52-59` `stageAutoSuppress` | `src/main/stages.ts` `stageAutoSuppress` |
| Stage 2 severity override + precedence (RULE-023 S2 / RULE-040) | `:62-84` `makeSeverityStage` | `src/main/stages.ts` `makeSeverityStage` |
| File match exact/suffix/substring (RULE-023 S3) | `:87-92` `fileMatches` | `src/main/stages.ts` `fileMatches` |
| Stage 3 ignore rules/files/overrides (RULE-023 S3) | `:95-122` `makeIgnoreStage` | `src/main/stages.ts` `makeIgnoreStage` |
| Inline-disable directive regex + parse (RULE-023 S4) | `:124-150` `DISABLE_NEXT_LINE_RE`/`parseInlineDisables` | `src/main/stages.ts` same names (+ `InlineDirective` type) |
| Stage 4 inline-disable (RULE-023 S4, BC-12) | `:152-185` `makeInlineDisableStage` | `src/main/stages.ts` `makeInlineDisableStage` |
| `runFilterPipeline` orchestration + tags strip (RULE-023, BC-11) | `:189-218` | `src/main/runFilterPipeline.ts` `runFilterPipeline` |
| `Diagnostic`/`Severity` contract | `@tsnuke/rules types.ts:13,46-66` (`import type`) | `src/main/Diagnostic.ts` (`effect/Schema`) |
| `TsNukeConfig` (rules/categories/ignore subset) | `core types.ts:151-164` (`import type`) | `src/main/Config.ts` (re-exports the canonical Config family from `@tsnuke/contracts-effect`; local subset DELETED) |

The public entry `runFilterPipeline(diagnostics, config, options?)` returns
`Diagnostic[]` — same signature as legacy.

---

## 2. Deviations from legacy

### D1 — Single canonical severity vocabulary (STRUCTURAL, behavior-preserving) ⚙️
Legacy normalized config's `"warn"` → engine `"warning"` in **two separate places**
(`load-config.ts:30-50` at load time, AND `filter-pipeline.ts:44-49` at filter
time) — the vocabulary trap **RULE-040 flags** as a suspected defect. This slice
adopts a **single canonical vocabulary**:

- The config-file vocabulary `error | warn | off` lives in ONE type:
  `Config.ts` `ConfigSeverity`.
- The canonical engine vocabulary `error | warning` lives in ONE type:
  `Diagnostic.ts` `Severity`.
- The mapping between them happens in exactly ONE function:
  `stages.ts` `normalizeConfigSeverity`.

This is a **behavior-PRESERVING** structural improvement (Brief: "adopt a single
canonical severity vocabulary … document it as deviation D-x"). The pipeline's only
normalization site is Stage 2; nothing downstream re-touches the vocabulary.
**It changes no outputs** — proven by the 34-fixture differential
(`equivalence.test.ts`), which asserts `modern === legacy` deeply, with the legacy
two-place normalization preserved verbatim in the oracle.

> Note: the slice only owns the *filter-time* normalization site. The *load-time*
> site (`load-config.ts`, RULE-024) is out of scope here; when that loader is
> migrated it should produce canonical severities and drop its own normalization,
> completing the consolidation (Follow-up #3).

### D2 — `import type` contracts → `effect/Schema` (D-style, no behavior change)
`Diagnostic`/`Severity` (legacy `@tsnuke/rules`) and the `TsNukeConfig` subset
(legacy `@tsnuke/core`) are modeled as `effect/Schema` (`Diagnostic.ts`,
`Config.ts`) per Brief line 94 — callers *can* `Schema.decode` untrusted input, but
`runFilterPipeline` does NOT decode on the hot path (kept pure & fast, per the
architecture-critic caveat, Brief line 25). `DiagnosticWithTags` (legacy's local
interface) is modeled as a Schema extension of `Diagnostic` with the optional
engine-only `tags`. No runtime behavior change — the Schemas are types-plus-optional-gate.

There is **no numeric/behavioral deviation** in this slice (contrast the `score`
slice's deliberate half-even rounding change). The transform is a faithful 1:1 of
the filtering logic.

---

## 3. What was NOT migrated (and why)

- **The stages + `runFilterPipeline` stayed plain, synchronous, pure functions —
  NOT `Effect`-wrapped.** Deliberate (Brief lines 25/91): wrapping deterministic
  CPU filtering in fibers buys nothing and costs the "performant" goal. Effect
  appears only in the contract/types layer (`Diagnostic.ts`, `Config.ts` — Schema).
- **Config loading / sanitizing (RULE-024) was NOT migrated.** This slice consumes
  an already-loaded `TsNukeConfig`; the lenient drop-not-throw loader
  (`load-config.ts`) is a separate module/slice.
- **`TsNukeConfig` is now DE-VENDORED.** The local 3-field subset (`rules`/
  `categories`/`ignore`) plus `ConfigSeverity`/`IgnoreConfig`/`IgnoreOverride` were
  DELETED; `Config.ts` re-exports the canonical Config family from
  `@tsnuke/contracts-effect`. The canonical `TsNukeConfig` is a structural
  SUPERSET of the old subset (adds `failOn`/`customRulesOnly`/`plugins`, and the
  canonical `IgnoreConfig` adds an optional `ignore.tags`), so every existing read
  (`config.rules`/`config.categories`/`config.ignore`) still typechecks unchanged.
  The pipeline's auto-suppress still uses the FROZEN `AUTO_SUPPRESS_TAGS` set, NOT
  `ignore.tags`, so that newly-visible field stays unread by this module (matches
  legacy). `normalizeConfigSeverity` (the `warn`→`warning` D1 consolidation) is
  BEHAVIOR, not a contract, and stays LOCAL in `stages.ts` — untouched.
- **`Fix`/`TextEdit`/`Tier`/`FixKind` schemas** are defined in `Diagnostic.ts` for a
  faithful contract even though the pipeline reads only
  `tags/plugin/rule/severity/category/filePath/line`. They cost nothing at runtime
  (no decode on the hot path) and seed the next slice; not re-exported from the
  barrel (pre-committed to deletion, Follow-up #1).
- **Consumers were not touched** (out of scope for this surgical slice): whoever
  calls `runFilterPipeline` in `core` (the `diagnose()` path) keeps its legacy
  import until migrated.

---

## 4. Follow-ups for the next module(s)

1. **De-vendor `Diagnostic` — DONE.** The local `Severity`/`Tier`/`FixKind`/`TextEdit`/
   `Fix`/`Diagnostic` Schema definitions in `Diagnostic.ts` were DELETED and replaced
   with re-exports of the canonical Schemas from `@tsnuke/contracts-effect` (the
   canonical `Diagnostic` is field-identical to the deleted copy — a proven superset).
   `DiagnosticWithTags` stays LOCAL as decided: it is now a thin type-only
   `interface DiagnosticWithTags extends Diagnostic { readonly tags?: readonly string[] }`
   (contracts deliberately excludes the engine-only `tags` carry from the public
   `Diagnostic`); the pipeline only ever uses it as a type, so no Schema value is needed.
   The barrel re-exports `Diagnostic`/`Severity` (values) + `DiagnosticWithTags` (type) as
   before. Suite stayed green (120/120) with no assertion change. Dep
   `@tsnuke/contracts-effect": file:../../contracts/effect` added; `vitest.config.ts`
   inlines it. (The Config family — `Config.ts`, `normalizeConfigSeverity` — is OUT of
   scope this pass and untouched; see Follow-ups #2/#3.)
2. **De-vendor `TsNukeConfig` — DONE.** The local 3-field subset Schema/types
   (`ConfigSeverity`/`IgnoreOverride`/`IgnoreConfig`/`TsNukeConfig`) in `Config.ts`
   were DELETED; the file now re-exports the canonical Config family from
   `@tsnuke/contracts-effect` (a proven structural superset of the old subset).
   The barrel keeps exporting `ConfigSeverity`/`TsNukeConfig` as before (public
   surface preserved). `normalizeConfigSeverity` (D1 behavior) stays local in
   `stages.ts`. Suite stayed green (120/120) with no assertion change; the dep +
   `vitest.config.ts` inline already existed from the Diagnostic de-vendor.
3. **Complete the single-vocabulary consolidation (D1):** when the config LOADER
   (`load-config.ts`, RULE-024) is migrated, have it emit canonical severities at
   load time and drop its own `warn`→`warning` mapping, so `normalizeConfigSeverity`
   here becomes the lone surviving normalization (or is removed if the loader
   produces canonical values directly). This closes RULE-040's "normalized in two
   places" defect end to end.
4. **This is the LAST GATE BEFORE SCORING — a bug here silently changes the score**
   (RULE-023, BUSINESS_RULES.md:422). When wiring this slice into the `score` slice's
   pipeline (`runFilterPipeline` → `computeScore`), keep the equivalence proof green:
   any change to drop/keep semantics moves the diagnostic set scoring sees, and thus
   the score, without any error surfacing. Treat both slices' test suites as a
   coupled contract at the cutover.

---

## 5. Toolchain / housekeeping notes

- **Configs copied from the `score` slice verbatim:** ESM (`"type": "module"`),
  `effect@^3.21.2`, `vitest@^3.2.0`, `typescript@^5.8.0`, `@types/node@^22.10.0`,
  `src/main` + `src/test` layout, `pnpm-workspace.yaml` with `allowBuilds: { esbuild: true }`,
  identical `tsconfig.json` / `vitest.config.ts`.
- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (same disposition as the `score` slice §5).
- **`.js` on relative specifiers** (e.g. `./stages.js`) per the legacy convention;
  `Bundler` moduleResolution resolves `.js` → `.ts`.
- **Run:** `cd modernized/filter-pipeline/effect && pnpm test` (vitest) ·
  `pnpm typecheck` (tsc).

---

## 6. Test inventory (120 tests, 7 files)

| File | Tests | Covers |
|------|------:|--------|
| `stageAutoSuppress.test.ts` | 7 | RULE-023 S1: frozen tag set, drop/keep, no self-strip |
| `stageSeverity.test.ts` | 15 | RULE-023 S2 / RULE-040: `normalizeConfigSeverity` (D1), rules off/remap, categories, **rules-precedence**, bare-vs-ns ids, identity |
| `stageIgnore.test.ts` | 19 | RULE-023 S3: `fileMatches` (exact/suffix/substring), ignore.rules (bare/ns), ignore.files (3 modes), overrides **with/without** rules |
| `stageInlineDisable.test.ts` | 18 | RULE-023 S4: `parseInlineDisables` (next-line targeting, no-rules=all, comma/space lists, CRLF/CR, comment styles), suppression, **line≤0 exempt**, missing/undefined sources |
| `stageOrder.test.ts` | 7 | RULE-023 order + short-circuit; remap visible downstream |
| `runFilterPipeline.test.ts` | 13 | gating (`respectInlineDisables`/`sources`), **tags strip**, bare-vs-ns end-to-end, empty/order boundaries |
| `equivalence.test.ts` | 41 | **THE PROOF**: vendored frozen legacy oracle + 38 crafted fixtures (incl. bare-vs-namespaced key-collision + out-of-vocab fallthrough, added in review), `modern === legacy` (deep), exercises real drops |

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `exit-code` and `build-report` slices. **No HIGH findings.** The
critic verified stage order/short-circuit, the D1 single-vocabulary consolidation
(behavior-preserving), the `tags` strip, and all inline-disable edge cases, and confirmed
the barrel correctly withholds the pre-deletion `Fix`/`TextEdit`/`Tier`/`FixKind` symbols
(the score slice's L2 lesson, applied). Verdict: the proof was *rigorous on breadth* but
had two adversarial gaps — now closed.

**Applied (closing the proof's gaps):**
- **Bare-vs-namespaced key COLLISION fixtures (MEDIUM — the #1 finding).** The
  `ruleOverrides[d.rule] ?? ruleOverrides[plugin/rule]` precedence (`stages.ts:68`) is the
  single most refactor-fragile, score-moving line in the slice, and no fixture pinned it
  (every test supplied one id form at a time). Added `equivalence.test.ts` fixtures with
  BOTH `r` and `tsnuke/r` present (bare-warn-beats-ns-off, bare-off-beats-ns-warn) plus
  both-forms-present collision fixtures for `ignore.rules` and `ignore.overrides.rules`. If
  the `??` operands are ever swapped, these now diverge from the oracle and fail.
- **Out-of-vocab config-severity fallthrough (MEDIUM).** Pinned that a stray engine token
  like `"warning"` (out of the `error|warn|off` config vocab) maps via the `else` branch to
  `"error"` in both pipelines — previously incidental, now a proven decision.

**Recorded, no change:** stage ORDER is asserted indirectly (most reorderings are
unobservable since both middle stages are pure drops); the meaningful order-sensitivity case
(a stage-2 remap visible downstream) IS covered by `stageOrder.test.ts`. Adequate.
