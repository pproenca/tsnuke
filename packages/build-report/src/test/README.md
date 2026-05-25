# Characterization tests — `build-report` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-doctor`'s versioned
JSON report builder. They were written *before* the implementation. The
implementation lives at `src/main/` (imported as `../main/index.js` — `.js` on
relative specifiers, per the legacy convention; the `Bundler` moduleResolution in
`tsconfig.json` resolves `.js` to `.ts`). Until that module existed the suite was
**RED**, and that was the correct starting state.

This is a **true strangler-fig** slice: it CONSUMES the already-completed `score`
slice (`@ts-doctor/score-effect`) for the monorepo MIN score (RULE-003) and band
label (RULE-002). The legacy module is the oracle
(`legacy/ts-doctor/packages/core/src/build-report.ts`, read-only).

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-004 | summary rollup: error/warning occurrence split, distinct-file count, total-OCCURRENCES count, MIN score, scoreLabel, partial OR | `summary.test.ts`, `equivalence.test.ts` |
| RULE-034 | `schemaVersion = 1`, `ok = (error === null)`, error `.cause` chain flattened root-last | `buildReport.test.ts`, `serializeError.test.ts`, `equivalence.test.ts`, `schema.test.ts` |
| RULE-033 | report `mode` (full/diff/staged) + diff metadata carry | `buildReport.test.ts` |
| RULE-003 | monorepo summary = MIN over present scores (provided by the score slice) | `summary.test.ts`, `equivalence.test.ts` |

## NO rounding deviation (unlike the `score` slice)

The `score` slice has a deliberate half-up → half-even rounding deviation. **This
slice has NONE.** `build-report` MINs the per-project scores that are *already
rounded integers*; the half-even change lives only in score *computation*. So the
modern report is **fully equivalent** to legacy — the equivalence proof expects
**100% structural equality**, not a pinned divergence.

## The `band` → `scoreLabel` wire mapping (RULE-034 wire compat)

The score slice's `ScoreResult` field is named `band`. The report wire field is
`scoreLabel` (`JsonReportSummary.scoreLabel`). The builder MAPS `band` → the
`scoreLabel` wire field, preserving wire compatibility for report consumers. The
tests assert the WIRE name `scoreLabel` (e.g. `summary.scoreLabel === "Critical"`).

## Two distinct counting semantics (RULE-004 flagged defect)

`summary.score` reflects **distinct rules** (RULE-001, computed in the score slice),
while `summary.totalDiagnosticCount` counts **occurrences**. They are NOT
interchangeable. `summary.test.ts` pins this explicitly: the same `plugin/rule`
firing 3× yields `totalDiagnosticCount = 3` (a distinct-rule count would be 1).

## How the equivalence proof works (`equivalence.test.ts`)

1. **Vendored, attributed frozen copies** of the legacy algorithm as the oracle:
   - `legacyBuildReport` / `legacySummarize` / `legacySerializeError`
     (legacy `build-report.ts:50-124`)
   - `legacyScoreLabel` / `legacySummarizeMonorepoScore` (legacy `score.ts:72-92`).
     These oracle score helpers operate on already-rounded integers, so they are
     numerically identical to the modern path (no half-up vs half-even difference
     can appear in a MIN of integers).
2. **Crafted multi-project fixtures** exercising error/warning split, duplicate
   filePaths within and across projects, the same rule firing N times (occurrences
   vs distinct rules), null/all-null/mixed scores, partial OR, full/diff/staged
   modes, error vs no-error (`ok`), and deep `.cause` chains.
3. For each fixture, assert `modern buildReport === legacy buildReport` via
   `toStrictEqual` (full structural equality of the whole `JsonReportV1`).
4. `serializeError` is differentially tested against the legacy oracle over Error /
   named-Error / deep-chain / non-Error-cause / non-Error-input cases.

## Running

```sh
cd modernized/build-report/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Vitest must transpile the `.ts`-entry `@ts-doctor/score-effect` dependency at test
time; `vitest.config.ts` sets `test.server.deps.inline: ["@ts-doctor/score-effect"]`
to make esbuild compile it (the `file:` link's `exports` is `./src/main/index.ts`).

## Public surface these tests expect (write the impl to match)

```ts
import {
  buildReport,                 // (input: BuildReportInput) => JsonReportV1
  serializeError,              // (err: unknown) => JsonReportError
  JSON_REPORT_SCHEMA_VERSION,  // 1 (const)
  JsonReportV1,                // effect/Schema wire contract (+ sub-schemas)
} from "../main/index.js";
import type { BuildReportInput, BuildReportProject, Diagnostic } from "../main/index.js";
```

- `summary.scoreLabel` is the WIRE field name (carries the score slice's `band`).
- `BuildReportProject.score` is the legacy `number | null`; bridged internally to
  the score slice's `Option<Score>` via `Option.fromNullable(n).pipe(Option.flatMap(decodeScore))`.
- `buildReport` / `serializeError` are PLAIN synchronous pure functions — NOT
  `Effect`-wrapped (Brief line 91).
```
