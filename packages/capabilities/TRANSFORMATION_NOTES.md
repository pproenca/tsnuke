# Transformation Notes — `capabilities` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke capabilities effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/capabilities.ts`
(72 lines; + the `RuleMeta`/`Severity`/`Capability` contract from
`packages/tsnuke-rules/src/types.ts`). Target: `modernized/capabilities/effect/`.

Implements **RULE-019** (universal rule-activation predicate, P0) and **RULE-020**
(inverted CFG gating). Verified by 54 characterization tests including an exhaustive
**8192-cell + 68-cell** differential equivalence proof.

**Result:** 54/54 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. **0 intentional
behavioral deviations** (0 divergence vs the legacy oracle).

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `capabilities.ts` | Target |
|----------|--------------------------|--------|
| `shouldActivate` predicate, 5-gate fixed order (RULE-019) | `:23-57` | `src/main/Capabilities.ts:38-78` |
| Inverted gating (`disabledBy` ANY-present) (RULE-020) | `:40-44` | `src/main/Capabilities.ts:60-64` |
| `resolveSeverity` (`off`→null, override, default) (RULE-019) | `:65-71` | `src/main/Capabilities.ts:90-96` |
| `RuleMeta` activation subset | `types.ts:97-123` (`interface`, `import type`) | `src/main/RuleMeta.ts:48-66` (`effect/Schema`) |
| `Severity` | `types.ts:13` (type alias) | `src/main/RuleMeta.ts:23` (`Schema.Literal`) |
| `Capability` | `types.ts:72` (type alias) | `src/main/RuleMeta.ts:31` (`Schema.String`) |

The legacy functions are bare `import type`-fed pure functions returning `boolean`
and `Severity | null`; the target preserves those signatures and return types
exactly — `shouldActivate` and `resolveSeverity` are byte-for-byte equivalent.

---

## 2. Deliberate deviations from legacy behavior

**None.** This is a behavior-preserving transformation. The equivalence proof
asserts `modern === legacy` in every one of 8192 (`shouldActivate`) + 68
(`resolveSeverity`) enumerated cells, with the harness self-guarding that the grid
was fully traversed and divergence is exactly 0. (Contrast the `score` slice, which
carried one human-approved rounding deviation.)

What *did* change is purely structural / contract-level (no behavior):

### S1 — Contract modeled as `effect/Schema` (additive, not behavioral)
`Severity` / `Capability` / `RuleMeta` are modeled as `effect/Schema`
(`RuleMeta.ts`) per Brief line 94, replacing legacy's bare type aliases / interface.
This adds a runtime trust-boundary decode (`decodeRuleMeta` =
`Schema.decodeUnknownEither(RuleMeta)`) for untrusted rule metadata. **The predicate
functions do NOT decode on the hot path** — they accept already-typed values and
stay plain & synchronous (Brief lines 25/91). So the Schema adds an *optional* gate
for callers; it changes no activation outcome.

### S2 — Predicate kept as plain synchronous pure functions (NOT `Effect`-wrapped)
Deliberate (Brief lines 25/91): a clean boolean predicate is the goal. Wrapping a
deterministic short-circuit conditional in `Effect`/`Match`/pipelines buys nothing
and obscures the load-bearing gate order. The Effect ecosystem appears only in the
contract layer (Schema). `resolveSeverity` keeps the legacy `Severity | null` return
(NOT `Option`) so the equivalence target is exact; the engine call site owns any
`Option` bridging.

### D-dead — RULE-019's known dead branch is PRESERVED
Gate 5 (`defaultEnabled === false && explicit === undefined → false`, the opt-in
gate) is **currently unreachable**: no rule in the catalog sets
`defaultEnabled: false` (BUSINESS_RULES.md:361 — the `recommended` preset selects
100% of rules; "machinery exists with no live members"). The gate is **preserved
verbatim** anyway — it is part of the contract (NFR forward-compat), and a future
opt-in rule must work. It is exercised in tests (both `false` and `true` states)
and in the equivalence grid, even though no live rule reaches it. **Do not drop it.**

---

## 3. What was NOT migrated (and why)

- **The predicate stayed plain, synchronous, pure functions — NOT `Effect`-wrapped.**
  See S2. Effect appears only in the contract/types (Schema).
- **Only the activation-relevant `RuleMeta` subset was vendored.** The predicate
  reads exactly `requires` / `disabledBy` / `tags` / `defaultEnabled` (gates) +
  `severity` (resolution); `id` / `category` / `tier` are carried for a faithful
  contract. The non-activation `RuleMeta` fields (`fixKind`, `message`,
  `recommendation`) are **not** modeled here — this slice owns only what it gates
  on. They belong to the full `@tsnuke/rules` contract (Follow-up #1).
- **`Tier` is defined but NOT re-exported** from the barrel — the predicate doesn't
  gate on it, and it is pre-committed to de-vendoring; publishing it would create a
  breaking removal later (barrel hygiene, mirrors the `score` slice's L2 finding).
- **No dead code dropped from `capabilities.ts`** — every line is live except gate 5
  (RULE-019's catalog-dead but contract-required branch), which is preserved on
  purpose (D-dead). Nothing was removed.
- **Consumers were not touched** (out of scope for this surgical slice): the engine /
  rule-registry call sites that invoke `shouldActivate` / `resolveSeverity` to build
  the active rule set. See Follow-ups.

---

## 4. Follow-ups for the next module(s) that depend on this one

1. **De-vendor `RuleMeta` — DONE.** Now imports the canonical
   `RuleMeta`/`Severity`/`Capability`/`Tier`/`decodeRuleMeta` from
   `@tsnuke/contracts-effect` (the consolidation slice that owns the FULL contract).
   The local vendored Schema definitions in `RuleMeta.ts` were DELETED; the file now
   only re-exports the contracts symbols (so the barrel + `Capabilities.ts` call sites
   are unchanged). The canonical `RuleMeta` is the proven structural SUPERSET of the
   activation subset this slice gated on, so `shouldActivate` / `resolveSeverity`
   behavior is identical — full suite stayed green (54/54), as did the `engine-plan`
   consumer (22/22). Dep `@tsnuke/contracts-effect": file:../../contracts/effect`
   added; `vitest.config.ts` inlines it (`.ts`-entry file dep).
2. **Engine / registry consumer migration.** The caller that loops the rule catalog
   building the active set (`shouldActivate` per rule) and registering each at
   `resolveSeverity(...)` (skipping `null`) must migrate onto this module. Keep the
   `null` skip semantics — `resolveSeverity` returns `Severity | null`, and `null`
   means "do not register this rule".
3. **Capability earning (RULE-021) feeds this.** This predicate consumes the
   `ReadonlySet<Capability>` that `discover-ts-project.ts` computes (RULE-021). The
   **critical RULE-020 invariant** rides on that producer: a strict flag that is OFF
   must emit NO token (token absence drives the inverted gate). **Rewrite trap
   (BUSINESS_RULES.md:376):** any reimplementation that defaults a missing flag to
   "on" would invert RULE-020. The capability-earning slice must preserve "absent =
   off".
4. **Load-bearing chain.** This predicate gates which rules run → which diagnostics
   exist → the score (the `score` slice). Treat it as load-bearing: a regression
   here silently changes the diagnostic set and therefore the health score, with no
   error. The exhaustive equivalence proof is the guard against that.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (mirrors the `score` slice). A more TS-idiomatic layout would co-locate
  `*.test.ts` beside sources; not changed, to respect the explicit instruction.
- **Schema decode API:** `RuleMeta.test.ts` uses `Schema.decodeUnknownEither` (and
  `Either.isRight`/`isLeft`) — the non-throwing decode form, matching the trust-
  boundary `decodeRuleMeta` export.
- **Conventions copied verbatim from the `score` slice:** ESM (`"type":"module"`),
  `effect@^3.21.2` + `vitest@^3.2.0` + `typescript@^5.8.0` + `@types/node@^22.10.0`,
  `.js` relative specifiers under `Bundler` resolution, `pnpm-workspace.yaml`
  `allowBuilds: { esbuild: true }`, identical `tsconfig.json` strictness flags.
- **Run:** `cd modernized/capabilities/effect && pnpm test` (vitest) ·
  `pnpm typecheck` (tsc).

---

## 7. Architecture review (consolidated, `architecture-critic`)

**No HIGH findings.** The critic confirmed the 8192-cell exhaustive proof is genuine
(16×16×8×4, self-guarded), the 6-gate short-circuit order is provably pinned, and the
RULE-019 dead branch (`defaultEnabled:false`) is preserved + noted. It explicitly
endorsed keeping `resolveSeverity`'s `Severity | null` return (not `Option`) for exact
legacy parity — the engine call site owns any `Option` bridging. **Do not let anyone
"Option-ify" it here.**

**Applied:**
- **Decode→predicate seam demonstrated end-to-end (MEDIUM).** `decodeRuleMeta` (the
  trust-boundary contract) had no in-tree caller, making the `RuleMeta` Schema risk being
  decoration. `RuleMeta.test.ts` now feeds a *decoded* (untrusted) RuleMeta straight into
  `shouldActivate`, exercising the RULE-019/020 inverted-gating path — so the decode seam is
  shown to work end-to-end, not merely asserted by field presence. `decodeRuleMeta` is kept
  (a real trust boundary for rule metadata from a future registry/plugin source).
