# Transformation Notes — `score` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor score effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/core/src/score.ts` (+ the `Diagnostic`
contract from `packages/ts-doctor-rules/src/types.ts`). Target: `modernized/score/effect/`.

Implements **RULE-001** (health score), **RULE-002** (band label), **RULE-003**
(monorepo MIN summary), **RULE-041** (frozen-determinism policy). Verified by 37
characterization tests including a 13,041-pair differential equivalence proof.

**Result:** 37/37 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `score.ts` | Target |
|----------|-------------------|--------|
| Frozen weights `1.5 / 0.75`, `PERFECT_SCORE 100` (RULE-041) | `:22-27` | `src/main/Score.ts:14-18` |
| Frozen band cutoffs `75 / 50` (RULE-041) | `:29-32` | `src/main/Score.ts:21-23` |
| Band label strings | `:34-36` (private consts) | `src/main/Score.ts:44` (`ScoreBand` literal union) |
| `plugin/rule` distinct key (RULE-001) | `:39-41` `ruleKey` | `src/main/Scoring.ts:47` `ruleKey` |
| `computeScore` (RULE-001) | `:49-69` | `src/main/Scoring.ts:73-96` (+ `roundHalfToEven` `:38-44`) |
| `scoreLabel` (RULE-002) | `:72-76` | `src/main/Scoring.ts:60-64` |
| `summarizeMonorepoScore` (RULE-003) | `:83-92` | `src/main/Scoring.ts:98-107` |
| `Diagnostic` input contract (RULE-031/032) | `types.ts:13,46-66` (`import type`) | `src/main/Diagnostic.ts` (`effect/Schema`) |

The legacy `computeScore` returned `{ score: number; label: string }`; the target
returns `{ score: Score; band: ScoreBand }` (`src/main/Score.ts:52`).

---

## 2. Deliberate deviations from legacy behavior

### D1 — Rounding: half-up → **half-even** (behavioral, human-approved) ⚠️
Legacy `score.ts:67` used `Math.round` (round-half-**up** toward +∞). This module
pins **round-half-to-even** (`Scoring.ts:38`), resolving RULE-001's flagged
suspected defect (BUSINESS_RULES.md:90). **This is the one place the modern score
is not numerically identical to legacy.**

- **Where it differs:** the penalty is always an exact multiple of `0.25`
  (`0.25·(6e+3w)`), so the raw score `100 − penalty` lands on `N.5` only when
  `2e+w ≡ 2 (mod 4)`. At `N.5`: half-even → `N` if `N` even, `N+1` if `N` odd;
  legacy half-up → always `N+1`. **So modern = legacy − 1 exactly when raw = `N.5`
  with `N` even** (in the non-floored region); identical everywhere else.
- **Magnitude:** in the test grid `e∈[0,80] × w∈[0,160]` (13,041 pairs), **578
  pairs diverge, each by exactly −1**; the rest are identical. Concretely: a single
  error rule → **98** (legacy 99); 3× the same rule → **98**; same rule across two
  files → **98**.
- **Band-boundary consequence:** a project at raw `74.5` is **"Needs work" (74)**
  here vs **"Great" (75)** in legacy. Rare but real — flowing directly from D1.
- **Float safety:** `0.25/0.5/0.75` are binary-exact, so the `=== 0.5` test in
  `roundHalfToEven` is exact (no epsilon needed). Asserted by the exhaustive grid.

> If byte-identical legacy scores are ever required (e.g. to avoid score churn on
> existing repos at the cutover), revert `roundHalfToEven` to `Math.round` — a
> one-line change isolated in `Scoring.ts`.

### D2 — `label: string` → `band: ScoreBand` (type narrowing + rename)
The result field is renamed `label` → `band` and typed as the literal union
`"Great" | "Needs work" | "Critical"` (`Score.ts:44`) instead of bare `string`.
The three label *values* are preserved verbatim (wire-compatible). Consumers that
read `result.label` must read `result.band` (see Follow-ups).

### D3 — `number | null` → `Option<Score>` (idiomatic Effect)
`summarizeMonorepoScore` takes `ReadonlyArray<Option<Score>>` and returns
`Option<Score>` instead of legacy's `(number | null)[] → number | null`. Bridge a
legacy nullable with `Option.fromNullable` / `Option.getOrNull`.

### D4 — Branded `Score` + `effect/Schema` contract
`Score` is a branded `Schema.Int` constrained to `[0,100]` (`Score.ts:29`), lifting
RULE-001's range postcondition into the type. The hot path uses an unchecked brand
(`unsafeScore`, `Scoring.ts:55`) since the math provably stays in range; the
validating `makeScore` (`Score.ts:38`) is for trust boundaries. `Diagnostic` is an
`effect/Schema` (`Diagnostic.ts`) per Brief line 94 — callers *can* `Schema.decode`
untrusted input, but `computeScore` does not decode on the hot path (kept pure &
fast, per the architecture-critic caveat, Brief line 25).

---

## 3. What was NOT migrated (and why)

- **The scoring math stayed plain, synchronous, pure functions — NOT `Effect`-wrapped.**
  Deliberate (Brief line 91 + line 25 architecture-critic caveat): wrapping
  deterministic CPU math in fibers buys nothing and costs the "performant" goal.
  Effect appears only in the contract/types (Schema, `Score` brand, `Option`).
- **No dead code in `score.ts`** — every line is live, so nothing was dropped.
  The only "removed" behavior is legacy's `Math.round`, replaced per D1.
- **Consumers were not touched** (out of scope for this surgical slice):
  `core/index.ts:231`, `build-report.ts:82,104`, `format-agent.ts:47,165`. See Follow-ups.
- **`Fix` / `TextEdit` / `Tier` schemas** are defined in `Diagnostic.ts` for a
  faithful contract even though scoring reads only `plugin/rule/severity`. They cost
  nothing at runtime (no decode on the hot path) and seed the next slice; if the
  architecture review prefers a leaner contract they can be trimmed to the three
  read fields.

---

## 4. Follow-ups for the next module(s) that depend on this one

1. **Consumer migration (field rename D2):** `core/index.ts:231` destructures
   `{ score, label }` and builds `ScoreResult{ score, label, partial }`;
   `format-agent.ts:165` and `build-report.ts:82` read the band as `scoreLabel`.
   When migrating these onto this module, map `result.band` → the existing
   `scoreLabel` wire field (**keep the wire field name `scoreLabel`** in
   `JsonReportV1` for report compatibility — RULE-004/034).
2. **`summarizeMonorepoScore` (D3):** `build-report.ts:104` passes
   `(number | null)[]` and uses the result as `number | null`. Bridge each entry
   with `Option.fromNullable(n).pipe(Option.flatMap(decodeScore))` (the non-throwing
   trust-boundary constructor in `Score.ts`), then `Option.getOrNull` the result.
3. **De-vendor `Diagnostic` — DONE.** The local `src/main/Diagnostic.ts` was DELETED;
   the slice now imports the canonical `Diagnostic`/`Severity` from
   `@ts-doctor/contracts-effect` (barrel re-export) and `Scoring.ts` imports the
   `Diagnostic` type from there too. The canonical Schema is field-identical (incl.
   `Schema.Int`) to the deleted copy — a proven superset — so the suite stayed green
   (37/37) with no assertion change. The narrow public surface is preserved: the barrel
   still re-exports ONLY `Diagnostic` + `Severity`. Dep
   `@ts-doctor/contracts-effect": file:../../contracts/effect` added; `vitest.config.ts`
   inlines it.
4. **`scorePartial` honesty (RULE-018/041):** this slice scores a single flat
   diagnostic set and is honestly partial-agnostic. The engine slice must carry the
   `partial` flag separately — a partial run uses the *same* scale, only flagged
   not-comparable. **Keep `ScoreResult` partial-free**: the engine should wrap it as
   `{ ...scoreResult, partial }` (as legacy `index.ts:232-236` does), NOT retrofit a
   `partial` field into this pure type.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written. A more TS-idiomatic layout would co-locate `*.test.ts` beside sources;
  not changed, to respect the explicit instruction.
- **Test API note:** `effect@3.21` exposes `Option` structural equality via
  `Equal.equals` (used in `summarizeMonorepoScore.test.ts`), not `Option.equals`.
- **Test helper cleanup:** removed a redundant `severity`/`rule` re-spread in the
  `diag()` helper (`computeScore.test.ts`) that tripped `TS2783`; no test semantics
  changed (the `...over` spread already supplied both).
- **Run:** `cd modernized/score/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Architecture review (Step 5, `architecture-critic`)

The critic independently re-verified 37/37 tests, the clean strict typecheck, the
578-divergence count, the float-exactness argument, and the floor-region safety —
all confirmed. Findings, with disposition:

**Applied (HIGH + cheap correctness/hygiene):**
- **H1 (HIGH) — brand made load-bearing.** `scoreLabel` took a raw `number`, so the
  `Score` brand (deviation D4) was enforced nowhere a consumer could reach. Split an
  internal `bandOf(n: number)` (used by `computeScore`) from the public
  `scoreLabel(score: Score)` (`Scoring.ts`). `scoreLabel(150)` is now a type error;
  band-boundary tests build inputs via `makeScore`.
- **M1 — non-throwing trust-boundary constructor.** Added `decodeScore` =
  `Schema.decodeUnknownOption(Score)` (`Score.ts`) so the legacy `number | null`
  bridge fails as a value, not an exception; clarified `makeScore` is for
  trusted/literal construction (throws by design).
- **M2 — severity caveat documented.** `computeScore` doc now states severity is
  bucketed structurally and the hot path does not decode, so an out-of-contract
  severity is treated as a warning (legacy parity), not rejected.
- **M3 — dropped unused `@effect/vitest`** devDependency (this pure slice has no
  `Effect<...>` values to test; all tests use plain `vitest`).
- **L1 — `roundHalfToEven` marked domain-restricted** (floor-biased; only valid for
  the non-negative raw scores this module produces — don't borrow it for signed deltas).
- **L2 — barrel narrowed.** `index.ts` no longer re-exports `Fix/TextEdit/Tier/FixKind`
  (still defined in `Diagnostic.ts` for fidelity); avoids publishing symbols the slice
  is pre-committed to deleting (Follow-up #3).

**Recorded, no change (validated as correct):**
- **L3 — `unsafeScore` on the hot path is right** (math provably yields an int in
  `[0,100]`; routing through `Schema.decodeSync` in a tight loop is the anti-pattern
  the brief warns against). It is module-private — correct.
- **L4 — `Option`-based `summarizeMonorepoScore` is idiomatic;** the hand-rolled MIN
  reduce is clear enough (could be `Order.min`, not worth it).
- **L5 — `scoreLabel` kept public** for migration parity with legacy (which exported
  it); now safe since it takes `Score`.
- **L6 — `src/main`/`src/test` Java-ism** owned in §5.
- **Q6 / partial-honesty (RULE-018):** `ScoreResult` has no `partial` field by design;
  the engine slice must wrap, not retrofit — see Follow-up #4.
