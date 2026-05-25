# Characterization tests — `filter-pipeline` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-doctor`'s four-stage
diagnostic filter pipeline. They were written *before* the implementation. The
implementation lives at `src/main/*.ts` (imported as `../main/index.js` — `.js` on
relative specifiers, per the legacy convention; the `Bundler` moduleResolution in
`tsconfig.json` resolves `.js` to `.ts`). Until that module exists the suite is
**RED**, and that is the correct starting state.

The legacy module is the oracle (`legacy/ts-doctor/packages/core/src/filter-pipeline.ts`,
read-only). We are proving *equivalence first*. Unlike the `score` slice, this
transform has **no intended behavioral deviation** — output must be 100% identical
to legacy. The only change is a STRUCTURAL one: the `warn`↔`warning` vocabulary is
consolidated into a single canonical severity vocabulary (RULE-040 deviation D1),
which must NOT change any output.

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-023 | four ordered stages, order load-bearing, short-circuit on drop | `stageOrder.test.ts`, `runFilterPipeline.test.ts` |
| RULE-023 S1 | auto-suppress — drop `tags` ∋ `"test-noise"` | `stageAutoSuppress.test.ts` |
| RULE-023 S2 / RULE-040 | severity override — `rules` (precedence) then `categories`; `"off"` drops; `"warn"`→`"warning"` | `stageSeverity.test.ts` |
| RULE-023 S3 | ignore — `ignore.rules` / `ignore.files` (exact/suffix/substring) / `ignore.overrides` | `stageIgnore.test.ts` |
| RULE-023 S4 | inline-disable — `// ts-doctor-disable-next-line [rules]`, next-line targeting, line≤0 exempt | `stageInlineDisable.test.ts` |
| RULE-023 | bare vs `plugin/rule` matching throughout; `tags` stripped before emit; gating on `respectInlineDisables`/`sources` | `runFilterPipeline.test.ts` |
| equivalence | modern === legacy oracle over crafted fixtures (100% equality) | `equivalence.test.ts` |

## Public surface these tests expect (write the impl to match)

```ts
import {
  runFilterPipeline,          // (diagnostics, config, options?) => Diagnostic[]
  stageAutoSuppress,          // (d: DiagnosticWithTags) => DiagnosticWithTags | null
  makeSeverityStage,          // (config) => Stage
  makeIgnoreStage,            // (config) => Stage
  makeInlineDisableStage,     // (sources?) => Stage
  parseInlineDisables,        // (text) => Map<number, { all; rules }>
  fileMatches,                // (filePath, pattern) => boolean
  normalizeConfigSeverity,    // (ConfigSeverity) => Severity | "off"
  AUTO_SUPPRESS_TAGS,         // ReadonlySet<string> = { "test-noise" }
} from "../main/index.js";
import type {
  Diagnostic, DiagnosticWithTags, Severity, TsDoctorConfig,
  FilterPipelineOptions, SourceTextMap, Stage,
} from "../main/index.js";
```

- `runFilterPipeline(diagnostics, config, options?)` returns a `Diagnostic[]` with
  the engine-only `tags` field **stripped**.
- A stage returns the (possibly remapped) diagnostic, or `null` to drop it.
- Stage order is fixed: auto-suppress → severity → ignore → inline-disable. A drop
  short-circuits later stages.

## The one structural change from legacy: single severity vocabulary (D1)

Legacy normalized config's `"warn"` → engine `"warning"` in TWO places
(`load-config.ts` and `filter-pipeline.ts:44-49`) — RULE-040 flags this as a
vocabulary trap. This slice keeps the config vocabulary (`ConfigSeverity =
"error"|"warn"|"off"`) in ONE module (`Config.ts`) and normalizes it in ONE
function (`normalizeConfigSeverity`, `stages.ts`). The canonical `Severity =
"error"|"warning"` is used everywhere else. **This changes no outputs** — proven by
`equivalence.test.ts`.

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen, attributed copy** of the legacy `runFilterPipeline` +
   helpers (`legacyRunFilterPipeline`) serves as the oracle.
2. A set of **crafted fixtures** (diagnostic sets + configs + sources) exercises
   every stage, both rule-id forms, all three file-match modes, overrides with and
   without rules, inline-disable parsing edge cases, the `tags` strip, and the
   `respectInlineDisables`/`sources` gating.
3. For each fixture we assert `modern === legacy` **structurally** (deep equality).
   Expect 100% equality — this transform has no intended numeric/behavioral
   deviation.

## Running

```sh
cd modernized/filter-pipeline/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/*.ts` exists. Once implemented, all tests must pass with
zero changes to these files.

## Adding a new case

1. Find the file for the stage you're pinning (or add `<fn>.test.ts`). Every
   `describe`/`it` block must cite its `// RULE-NNN`.
2. Use literal inputs and literal expected outputs — state the behavior in the test
   name, e.g. `"override without rules drops ALL diagnostics in matched files"`.
3. Build diagnostics with the local `diag(...)` helper (mirrors the legacy test).
4. Behaviors not yet implemented are marked `it.skip("pending RULE-NNN")` — never
   deleted.
