# Characterization tests — `capabilities` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-doctor`'s
capability-gated rule-activation predicate. They were written *before* the
implementation. The implementation lives at `src/main/index.ts` (imported as
`../main/index.js` — `.js` on relative specifiers, per the legacy convention; the
`Bundler` moduleResolution in `tsconfig.json` resolves `.js` to `.ts`). Until that
module exists the suite is **RED**, and that is the correct starting state.

The legacy module is the oracle
(`legacy/ts-doctor/packages/ts-doctor-rules/src/capabilities.ts`, read-only). We
are proving *equivalence first*. Unlike the `score` slice, this transformation has
**ZERO intentional behavioral deviations** — the predicate (and its load-bearing
short-circuit order) is preserved exactly. Expected divergence: **0**.

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-019 | universal activation predicate: 5 short-circuit gates in FIXED order; severity resolution (`off`→null, override, default) | `shouldActivate.test.ts`, `resolveSeverity.test.ts`, `equivalence.test.ts` |
| RULE-020 | inverted CFG gating: `requires:["tsconfig"]`+`disabledBy:["X"]` active IFF `X` ABSENT (self-disables once flag on) | `shouldActivate.test.ts`, `equivalence.test.ts` |
| (contract) | `RuleMeta`/`Severity`/`Capability` as `effect/Schema`; decode accepts/rejects | `RuleMeta.test.ts` |

## The load-bearing short-circuit ORDER (RULE-019)

`shouldActivate(rule, caps, ignoredTags, explicit?)` is evaluated in this FIXED
order; each gate can short-circuit to `false`:

1. `explicit === "off"` → false (off wins outright)
2. every `requires` token ∈ `caps`, else false (AND-gate)
3. any `disabledBy` token ∈ `caps` → false (inverted gating, RULE-020)
4. any `rule.tags` ∈ `ignoredTags` → false
5. `defaultEnabled === false && explicit === undefined` → false (opt-in)
6. else true.

`shouldActivate.test.ts` exercises each gate in **isolation** and then in
**combination** to pin that the order matters — e.g. `"off"` beats a satisfied
`requires`; a present `disabledBy` beats a satisfied `requires`; an ignored tag
disables even when requires/disabledBy pass; an opt-in stays off until an explicit
override revives it.

`resolveSeverity(rule, explicit?)`: `explicit === "off"` → `null`; else
`explicit ?? rule.severity` (override wins, undefined falls through to the default).

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of legacy `shouldActivate` / `resolveSeverity`
   (`capabilities.ts:23-71`) serves as the oracle — not refactored, not "fixed".
2. We **exhaustively enumerate** a finite cross-product:
   - **17 crafted rule metas** spanning the presence/absence of every gate field,
     AND/OR multiplicities, the empty-array edge cases, both `defaultEnabled`
     states (incl. the known dead `false`), and the canonical RULE-020 shapes
     (`enable-strict`, the dual-gated `enable-use-unknown-in-catch`).
   - **every subset** of a 4-token capability universe (`2^4 = 16`) — chosen to
     intersect the metas' `requires`/`disabledBy` tokens so those gates flip both
     ways.
   - **every subset** of a 3-tag ignored-tags universe (`2^3 = 8`).
   - **explicit ∈ { undefined, "off", "error", "warning" }** (4).
3. `shouldActivate`: `17 × 16 × 8 × 4 = 8192` cells, asserting `modern === legacy`
   in every cell. `resolveSeverity`: `17 × 4 = 68` cells. The harness self-guards
   that the full grid was traversed, **divergence count is 0**, and BOTH `true`/`false`
   (and all three severity branches) actually occurred.

## Running

```sh
cd modernized/capabilities/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests must
pass with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  shouldActivate,   // (rule, caps: ReadonlySet, ignoredTags: ReadonlySet, explicit?) => boolean
  resolveSeverity,  // (rule, explicit?) => Severity | null
  RuleMeta,         // effect/Schema Struct (activation-relevant subset)
  Severity,         // effect/Schema Literal("error","warning")
  Capability,       // effect/Schema String token
  decodeRuleMeta,   // Schema.decodeUnknownEither(RuleMeta)
} from "../main/index.js";
import type { RuleMeta, Severity, Capability } from "../main/index.js";
```

- `shouldActivate` / `resolveSeverity` are **plain synchronous pure functions**,
  NOT `Effect<...>`-wrapped (Brief lines 25/91). The Effect ecosystem is used only
  in the contract layer (Schema).
- `resolveSeverity` returns `Severity | null` (the `null` mirrors legacy exactly —
  the engine call site owns any `Option` bridging).

## Adding a new case

1. Find the file for the rule you're pinning. Every `describe`/`it` block must
   cite its `// RULE-NNN`.
2. Use literal inputs and literal expected outputs — state the gate semantics in
   the test name (e.g. `"disabledBy present beats requires-satisfied"`).
3. Build rule metas with the local `rule(...)` helper; cap/tag sets with `caps(...)`
   / `tags(...)`.
4. If the case is a NEW gate interaction, add the relevant tokens to the
   `equivalence.test.ts` universes so the exhaustive grid covers it too.
