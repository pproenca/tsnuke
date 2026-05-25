# Characterization tests — `score` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-fix`'s local
health scoring. They were written *before* the implementation. The
implementation lives at `src/main/index.ts` (imported as `../main/index.js` —
`.js` on relative specifiers, per the legacy convention; the `Bundler`
moduleResolution in `tsconfig.json` resolves `.js` to `.ts`). Until that module
exists the suite is **RED**, and that is the correct starting state.

The legacy module is the oracle (`legacy/ts-fix/packages/core/src/score.ts`,
read-only). We are proving *equivalence first*; the one intentional behavioral
change (rounding policy) is pinned explicitly, not silently.

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-001 | health score: `max(0, round(100 - (1.5*distinctErr + 0.75*distinctWarn)))`, empty -> 100 | `computeScore.test.ts`, `equivalence.test.ts` |
| RULE-002 | band label: `>=75 Great`, `>=50 Needs work`, else `Critical` (lower-bound inclusive) | `scoreLabel.test.ts` |
| RULE-003 | monorepo summary = MIN over present scores; none -> absent | `summarizeMonorepoScore.test.ts` |
| RULE-041 | frozen constants `1.5 / 0.75 / 100 / 75 / 50` | asserted in each file |

## The one deliberate deviation from legacy: rounding

Legacy `score.ts:67` uses `Math.round` (round-half-**UP** toward +infinity). The
modern module pins round-half-to-**EVEN** (banker's rounding) — a human-approved
decision (RULE-001's flagged suspected defect). Penalty is always a multiple of
`0.25` (= `0.25 * (6e + 3w)`), so `raw = 100 - penalty` lands on `N.5` only when
`2e + w ≡ 2 (mod 4)`. At `N.5`: half-even -> `N` if `N` even, `N+1` if `N` odd;
legacy half-up always -> `N+1`. Therefore:

> **modern = legacy − 1** exactly when `raw = N.5` with `N` even (in the
> non-floored region); **modern = legacy** otherwise.

The test expectations encode the **half-even** outputs. They intentionally
contradict `legacy/.../score.test.ts` (which asserts the half-up values). That is
the point of the deviation.

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy algorithm (`legacyComputeScore`,
   half-up) serves as the oracle.
2. An **independent** half-even reference (`roundHalfEven`) is authored from
   first principles in the test so assertions are not circular with the impl.
3. We **exhaustively enumerate** `e ∈ [0,80]` distinct error rules ×
   `w ∈ [0,160]` distinct warning rules (13,041 pairs), building that many
   distinct-keyed diagnostics. For each pair we assert (A) `modern === roundHalfEven(max(0, 100 − penalty))`
   and (B) the precise relationship to the oracle (equal, or `legacy − 1` at
   even-N halves). The grid covers every residue class of `(6e+3w) mod 4` — so
   every half-case and non-half-case — plus the floor-at-0 region.
4. A deterministic distinctness trial repeats each rule a pseudo-random number of
   times and asserts the score is unchanged (breadth-not-depth).

## Running

```sh
cd modernized/score/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests must
pass with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import { Option } from "effect";
import {
  ERROR_RULE_PENALTY,    // 1.5  (FROZEN)
  WARNING_RULE_PENALTY,  // 0.75 (FROZEN)
  PERFECT_SCORE,         // 100  (FROZEN)
  SCORE_GOOD,            // 75   (FROZEN)
  SCORE_OK,              // 50   (FROZEN)
  makeScore,             // (n: number) => Score   smart constructor, integer in [0,100]
  computeScore,          // (diagnostics: ReadonlyArray<Diagnostic>) => ScoreResult
  scoreLabel,            // (score: number) => ScoreBand
  summarizeMonorepoScore // (scores: ReadonlyArray<Option.Option<Score>>) => Option.Option<Score>
} from "../main/index.js";
import type { Diagnostic, Score, ScoreBand, ScoreResult } from "../main/index.js";
```

- `ScoreResult = { readonly score: Score; readonly band: ScoreBand }` — field is
  **`band`** (`"Great" | "Needs work" | "Critical"`), NOT legacy's `label: string`.
- `Score` is a branded number (runtime-erased; compares to plain numbers via `toBe`).
- `Diagnostic` minimal scoring projection: `{ plugin: string; rule: string; severity: "error" | "warning" }` (extra fields allowed).
- `summarizeMonorepoScore` takes/returns `Option<Score>` (replaces legacy `number | null`).

## Adding a new case

1. Find the file for the rule you're pinning (or add `<fn>.test.ts` for a new
   function). Every `describe`/`it` block must cite its `// RULE-NNN`.
2. Use literal inputs and literal expected outputs — no "should compute
   correctly". State the arithmetic in the test name, e.g.
   `"3 error + 0 warning -> raw 95.5 -> 96"`.
3. Build diagnostics with the local `diag(...)` helper (`computeScore.test.ts`)
   or `buildDiagnostics(e, w)` (`equivalence.test.ts`).
4. If the case is an exact half, double-check it against the half-even rule
   above and add it to the divergence narrative if it diverges from legacy.
5. Behaviors not yet implemented in the target are marked
   `it.skip("pending RULE-NNN")` — never deleted.
```
