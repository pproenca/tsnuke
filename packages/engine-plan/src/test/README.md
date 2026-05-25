# Characterization tests — `engine-plan` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `tsnuke`'s PURE
two-tier engine planner (`planEngineRun`, **RULE-018** — the partial-honesty
contract, the single most behavior-defining rule in the system). They were
written *before* the implementation. The implementation lives at
`src/main/index.ts` (imported as `../main/index.js` — `.js` on relative
specifiers, per the legacy convention; the `Bundler` moduleResolution in
`tsconfig.json` resolves `.js` to `.ts`). Until that module exists the suite is
**RED**, and that is the correct starting state.

The legacy module is the oracle
(`legacy/tsnuke/packages/core/src/engine-plan.ts`, read-only). We are proving
*equivalence first*; this slice has **zero intentional behavioral deviations**
(the only structural change is consuming the capabilities slice's
`resolveSeverity` instead of legacy's byte-identical private copy).

## Rule under test

| Rule | What | File |
|------|------|------|
| RULE-018 | Two-tier eligibility & `typecheck:ok` gate; partial-honesty | `planEngineRun.test.ts`, `equivalence.test.ts` |
| RULE-019/020 | Activation predicate (consumed from `@tsnuke/capabilities-effect`) | exercised via the REAL `shouldActivate` |

## The partial-honesty contract (preserve EXACTLY)

`planEngineRun(rules, caps, ignoredTags, overrides, deep, activate) → EnginePlan`:

- Tier-1 tiers = `{SYN, CFG, GRAPH}` (always run); Tier-2 tier = `TYP`.
- `typecheckOk = caps.has("typecheck:ok")`; `tier2Enabled = typecheckOk && deep !== false`.
- **Synthetic `capsForTyp`** (load-bearing): for TYP rules, activation/skip-accounting
  is evaluated against caps with a synthetic `typecheck:ok` injected when absent, so a
  TYP rule that WOULD run is counted as skipped even when the token is absent — but the
  actual RUN stays gated on the real `tier2Enabled`.
- A rule joins its tier only if `activate(...)` is true AND `resolveSeverity ≠ null`
  (`"off"` skips).
- When `!tier2Enabled`: every ACTIVATED TYP rule → `skippedCheckReasons[id] = reason`
  + `skippedChecks.push(id)`; reason = `SKIP_REASON_NO_TYPECHECK` if `!typecheckOk`
  else `SKIP_REASON_NO_DEEP`. `scorePartial = skippedChecks.length > 0`.
- The two `SKIP_REASON_*` strings are preserved verbatim.

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy `planEngineRun` (+ its private
   `resolveSeverity` and the two skip-reason constants) serves as the oracle.
2. A crafted matrix is enumerated:
   `rule sets (mixed SYN/CFG/GRAPH/TYP) × cap sets (typecheck:ok present/absent ×
   other tokens) × ignoredTags × overrides (incl. "off") × deep ∈ {true,false,undefined}`
   — **9,600 cells per predicate**.
3. Each cell asserts the FULL `EnginePlan` deep-equals (`toStrictEqual`):
   `tier1 / tier2 / tier2Enabled / skippedCheckReasons / skippedChecks / scorePartial`.
4. Run with **BOTH** the REAL `shouldActivate` (from the consumed
   `@tsnuke/capabilities-effect` slice) AND a trivial injected predicate
   (`() => true`). Expected divergence: **0** in every cell.

## Running

```sh
cd modernized/engine-plan/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests must
pass with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  SKIP_REASON_NO_TYPECHECK, // string (FROZEN, verbatim from legacy)
  SKIP_REASON_NO_DEEP,      // string (FROZEN, verbatim from legacy)
  planEngineRun,            // (rules, caps, ignoredTags, overrides, deep, activate) => EnginePlan
} from "../main/index.js";
import type {
  EnginePlan,
  SeverityOverrides,    // ReadonlyMap<string, Severity | "off">
  ActivatePredicate,    // matches @tsnuke/capabilities-effect#shouldActivate
  RuleMeta, Severity, Capability, // re-exported from the consumed capabilities slice
} from "../main/index.js";
```

- `RuleMeta`/`Severity`/`Capability` are **re-exported** from
  `@tsnuke/capabilities-effect` (not re-vendored). `Tier` is derived as
  `RuleMeta["tier"]`.
- `planEngineRun` is a **plain synchronous pure function** — NOT `Effect`-wrapped.
- The activation predicate is **INJECTED** so the planner is testable in isolation;
  production wires the consumed `shouldActivate`.
