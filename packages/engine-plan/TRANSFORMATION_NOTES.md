# Transformation Notes — `engine-plan` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke engine-plan effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/core/src/engine-plan.ts` (142 lines).
Target: `modernized/engine-plan/effect/`.

This is a **true strangler-fig**: the slice CONSUMES the already-completed
`capabilities` slice (`@tsnuke/capabilities-effect`) for the activation predicate
`shouldActivate` and severity resolution `resolveSeverity` (RULE-019/020), plus the
`RuleMeta` / `Severity` / `Capability` contract — it does NOT re-vendor them. The
`capabilities` slice is DONE and was NOT modified.

Implements **RULE-018** (two-tier eligibility & `typecheck:ok` gate; the
partial-honesty contract — *the single most behavior-defining rule in the system*,
P0). Verified by 22 characterization tests including a **9,600-cell × 2-predicate**
(19,200-comparison) differential equivalence proof against a vendored frozen legacy
oracle.

**Result:** 22/22 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. **0 intentional
behavioral deviations** (0 divergence vs the legacy oracle).

**`file:` dependency import path:** the `file:../../capabilities/effect`
dependency imports cleanly via the package name `@tsnuke/capabilities-effect`
(`EnginePlan.ts`). Vitest transpiles the `.ts`-entry dependency at test time via
`vitest.config.ts → test.server.deps.inline: ["@tsnuke/capabilities-effect"]`
(exactly as build-report inlines `@tsnuke/score-effect`). No relative-import
fallback was needed.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `engine-plan.ts` | Target |
|----------|-------------------------|--------|
| `TIER1_TIERS = {SYN, CFG, GRAPH}` (RULE-018) | `:21` | `src/main/EnginePlan.ts:60` |
| `TIER2_TIER = TYP` (RULE-018) | `:23` | `src/main/EnginePlan.ts:62` |
| `SKIP_REASON_NO_TYPECHECK` (verbatim) | `:26-27` | `src/main/EnginePlan.ts:68-69` |
| `SKIP_REASON_NO_DEEP` (verbatim) | `:28-29` | `src/main/EnginePlan.ts:74-75` |
| `EnginePlan` result shape | `:32-45` (`interface`) | `src/main/EnginePlan.ts:85-101` |
| `SeverityOverrides` (id → sev/off) | `:48` | `src/main/EnginePlan.ts:108` |
| `ActivatePredicate` shape | `:51-56` | `src/main/EnginePlan.ts:116-121` |
| `resolveSeverity` (off→null, override, default) | `:59-65` (**private copy**) | **consumed** from `@tsnuke/capabilities-effect` (see D1) |
| `typecheckOk` / `tier2Enabled` gate | `:94-95` | `src/main/EnginePlan.ts:144-145` |
| SYNTHETIC `capsForTyp` skip-accounting | `:97-104` | `src/main/EnginePlan.ts:153-156` |
| per-rule tier dispatch + activate + sev gate | `:106-121` | `src/main/EnginePlan.ts:158-176` |
| skip-reason accounting + `scorePartial` | `:123-140` | `src/main/EnginePlan.ts:178-196` |
| `RuleMeta`/`Severity`/`Capability`/`Tier` types | `:13-18` (`import type` from `@tsnuke/rules`) | **consumed** from `@tsnuke/capabilities-effect` (`Tier` = `RuleMeta["tier"]`) |

The behavior of `planEngineRun` is preserved EXACTLY — the loop, the synthetic
`capsForTyp`, the reason precedence (`!typecheckOk` first), and `scorePartial =
skippedChecks.length > 0` are line-for-line equivalent to legacy.

---

## 2. Deliberate deviations from legacy behavior

### D0 — NO behavioral deviation ✅
`planEngineRun` is byte-for-byte equivalent to legacy across the full 9,600-cell ×
2-predicate matrix (`equivalence.test.ts`), with both the REAL `shouldActivate` and a
trivial injected predicate. The half-even rounding deviation that exists in the
`score` slice does NOT apply here — this slice does no arithmetic.

### D1 — consume capabilities' `resolveSeverity` instead of legacy's PRIVATE copy ⚠ (structural, not behavioral)
Legacy `engine-plan.ts:59-65` defines its OWN private `resolveSeverity`, duplicating
the one in `packages/tsnuke-rules/src/capabilities.ts`. The two are
**byte-identical** (`if (explicit === "off") return null; return explicit ?? meta.severity;`).
Rather than re-vendor a second copy, this slice IMPORTS `resolveSeverity` from
`@tsnuke/capabilities-effect`. This removes the legacy duplication; it is
behavior-preserving (the equivalence oracle keeps the frozen private copy and the
modern path matches it in every cell). Brief-sanctioned ("prefer reusing the
capabilities slice's `resolveSeverity` … verify it's identical first" — verified).

### D2 — `Tier` derived as `RuleMeta["tier"]` (no re-vendored copy)
Legacy imports `Tier` from `@tsnuke/rules`. The capabilities slice OWNS the `Tier`
literal (`RuleMeta.tier`) but deliberately does NOT re-export it from its barrel
(barrel hygiene). Re-declaring a parallel `Schema.Literal("SYN","TYP","GRAPH","CFG")`
here would risk a conflicting copy, so `Tier` is derived as `RuleMeta["tier"]`
(`EnginePlan.ts:53`) — same literal, single source of truth, zero re-vendoring.

### D3 — `readonly` arrays on the `EnginePlan` shape (type narrowing only)
`tier1`/`tier2`/`skippedChecks` are typed `ReadonlyArray` (legacy used mutable
`[]`), and `tier1`/`tier2` carry a named `PlannedRule` interface (`{ meta; severity }`)
instead of an inline literal. No runtime difference — the planner still builds plain
mutable arrays internally; this only tightens the published contract. `toStrictEqual`
in the equivalence proof confirms the runtime objects are identical to legacy's.

---

## 3. What was NOT migrated (and why)

- **`planEngineRun` stayed a plain, synchronous, pure function — NOT `Effect`-wrapped.**
  Deliberate (Brief lines 25/91): it is pure CPU planning over in-memory token sets;
  wrapping it in a fiber buys nothing and costs the "performant" goal. The Effect
  ecosystem appears only in the consumed contract layer (`RuleMeta`/`Severity`/
  `Capability` are `effect/Schema` in the capabilities slice).
- **The activation predicate stays INJECTED** (`ActivatePredicate`) rather than
  hard-wired to `shouldActivate`. This is the legacy design (engine-plan is free of a
  runtime dependency on the predicate's internals so it is unit-testable in
  isolation) and is preserved; production passes the consumed `shouldActivate`.
- **No `ts.Program` / capability computation / rule execution.** This slice plans
  ONLY (RULE-018 is the planning decision). Building the real `ts.Program`, computing
  `typecheck:ok` from `getPreEmitDiagnostics()`, and actually running the planned
  rules belong to the engine slice (see Follow-ups). Legacy `engine-plan.ts` likewise
  does no I/O.
- **No dead code in `engine-plan.ts`** — every line is live; nothing was dropped. The
  only "removed" item is legacy's redundant private `resolveSeverity` (D1).
- **`shouldActivate` / `resolveSeverity` were NOT re-exported** from this barrel —
  import them from `@tsnuke/capabilities-effect` directly. This keeps the barrel's
  surface the planner's own and avoids re-publishing the consumed slice's API.

---

## 4. Follow-ups for the engine slice (the next module that depends on this one)

1. **Wire `planEngineRun`'s output to the real run.** The engine slice must:
   build one `ts.Program` (when `deep !== false` and files exist), set `typecheck:ok`
   iff `getPreEmitDiagnostics()` has zero `Error`-category diagnostics, compute the
   capability set (RULE-021), then call `planEngineRun(...)` and execute `plan.tier1`
   (always) and `plan.tier2` (with the shared `TypeChecker`, only when
   `plan.tier2Enabled`). Pass the REAL `shouldActivate` as the `activate` argument.
2. **PRESERVE the synthetic `typecheck:ok` skip-accounting.** When wiring the engine,
   do NOT "optimize away" the `capsForTyp` injection — it is the mechanism that lets a
   TYP rule be reported as skipped when the token is absent. The actual run stays gated
   on the real `tier2Enabled`. Pinned by `planEngineRun.test.ts` and the equivalence
   proof.
3. **The engine REFUSES to trust a caller-supplied `typecheck:ok`** (RULE-018 edge
   case): it deletes the token from caps when no `ts.Program` is built, so a stale/forged
   token can't open Tier-2. That deletion happens in the engine slice (capability
   reconciliation), NOT here — this planner takes caps as given.
4. **THE partial-honesty contract (RULE-018/041).** `scorePartial` flags that the
   score is on the *same scale* as a full run but is "not comparable" to it — only the
   flag differs. The engine must thread `plan.scorePartial` and `plan.skippedChecks`
   into the per-project report entry (the `score` slice stays partial-free; the engine
   wraps it as `{ ...scoreResult, partial }` — see score TRANSFORMATION_NOTES
   Follow-up #4). Do NOT retrofit a `partial` field into the score type.
5. **De-vendor the contract.** `RuleMeta`/`Severity`/`Capability` are re-exported from
   `@tsnuke/capabilities-effect`, which itself vendors a subset pending the
   `@tsnuke/rules` Effect slice (capabilities Follow-up #1). When `@tsnuke/rules`
   lands, both slices repoint to it; this slice's re-export stays a one-line change.

---

## 5. Toolchain / housekeeping notes

- **`file:` workspace dependency:** `package.json` declares
  `"@tsnuke/capabilities-effect": "file:../../capabilities/effect"`. `pnpm install`
  links it; the package-name import (`from "@tsnuke/capabilities-effect"`) resolves
  to the capabilities slice's `src/main/index.ts` (its `exports` entry).
- **Vitest `.ts`-dependency transpile:** `vitest.config.ts` sets
  `test.server.deps.inline: ["@tsnuke/capabilities-effect"]` so esbuild compiles
  the dependency's TypeScript at test time (otherwise Vitest tries to load the `.ts`
  entry as pre-built and fails to parse it). Identical pattern to build-report.
- **`pnpm-workspace.yaml`** approves the `esbuild` build (vitest needs it), matching
  the score / capabilities / build-report slices.
- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (same as the sibling slices).
- **`.js` specifiers on relative imports** (`./EnginePlan.js`) — the legacy
  convention; `Bundler` moduleResolution resolves `.js` to `.ts`.
- **Run:** `cd modernized/engine-plan/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (22 tests)

| File | Tests | Covers |
|------|-------|--------|
| `planEngineRun.test.ts` | 19 | RULE-018: Tier-1 always runs (incl. deep=false, unknown tier dropped); Tier-2 gated (typecheck:ok + deep≠false → runs; absent → NO_TYPECHECK; deep=false → NO_DEEP even with typecheck:ok); SYNTHETIC capsForTyp skip-accounting (skipped when token absent; only typecheck:ok injected, not other requires; multiple TYP in order); "off" override removes from tier AND from skip-accounting; severity override applied; scorePartial true IFF a TYP rule skipped; empty rule set; reject-all predicate |
| `equivalence.test.ts` | 3 | THE PROOF — modern `planEngineRun` === frozen legacy oracle (incl. legacy's private `resolveSeverity`) over a 9,600-cell matrix (10 rule sets × 16 cap sets × 4 ignoredTag sets × 5 override sets × 3 deep states), run with BOTH the REAL `shouldActivate` and a trivial predicate (19,200 comparisons, 0 divergence); + verbatim skip-reason-constant assertions |

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `config` loader and `scale` slices. **No findings above LOW — the
cleanest of the three.** The critic independently confirmed:
- the synthetic `capsForTyp` skip-accounting is byte-identical to legacy AND pinned by two
  tests that would catch its removal (a TYP rule reported skipped when `typecheck:ok` is
  ABSENT; only `typecheck:ok` injected, not other `requires`) — the most subtle,
  score-affecting line, correctly fenced;
- the consumed capabilities `resolveSeverity` (D1) is byte-identical to legacy's private
  copy (diffed) — no severity/"off" drift;
- the 9,600-cell proof is real (run against both the real `shouldActivate` and a trivial
  predicate, self-guarded that Tier-2-open / skipped / Tier-1 cases all fired);
- the `file:` dep resolves the REAL capabilities source (pnpm hard-link), not a stale copy.

**No changes applied.**

**Recorded (LOW, cross-slice):** the capabilities slice's `decodeRuleMeta` export still has
no consumer in any slice. The ENGINE slice (which receives untrusted rule metadata from the
registry) must either call it at that trust boundary or it should be removed as ceremony —
tracked so the seam is made load-bearing, not dropped silently.
