# Transformation Notes — `exit-code` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke exit-code effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke/src/exit-code.ts` (60 lines)
(+ the `FailOn` literal from `packages/tsnuke/src/flags.ts:14` and `Severity` from
`packages/tsnuke-rules/src/types.ts:13`). Target: `modernized/exit-code/effect/`.

Implements **RULE-030** (process exit-code resolution / `--fail-on` gate) and
**RULE-031** (severity vocabulary — `error | warning`, no `info`). Verified by 25
characterization tests including an exhaustive differential equivalence proof over
the **full enumerated input space** (9 gate cells + 54 resolver combinations).

**Result:** 25/25 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. **Zero behavioral
deviations** — exit-code logic is a finite, discrete decision with no rounding
subtlety, so modern === legacy in every cell.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `exit-code.ts` | Target |
|----------|-----------------------|--------|
| `shouldFailForDiagnostics` gate (RULE-030) | `:18-35` | `src/main/resolve.ts:46-56` |
| `failOn` switch dispatch + exhaustiveness | `:22-34` (`switch` + `never` guard) | `src/main/resolve.ts:51-55` (`Match.exhaustive`) |
| `none` → false | `:23-24` | `resolve.ts:52` |
| `warning` → ANY diagnostic | `:25-26` | `resolve.ts:53` |
| `error` → some `severity === "error"` | `:27-28` | `resolve.ts:54` |
| `ExitCodeInputs` shape | `:38-45` | `src/main/resolve.ts:59-78` |
| `resolveExitCode` precedence (RULE-030) | `:56-60` | `src/main/resolve.ts:88-92` |
| `hadError === true` → 1 | `:57` | `resolve.ts:89` |
| `scoreMode` → 0 | `:58` | `resolve.ts:90` |
| gate → `1 : 0` | `:59` | `resolve.ts:91` |
| `FailOn = "error" \| "warning" \| "none"` | `flags.ts:14` | `src/main/FailOn.ts:26` (`Schema.Literal`) |
| default `failOn = "error"` | `flags.ts` (parse default) | `src/main/FailOn.ts:33` (`DEFAULT_FAIL_ON`) |
| `Severity = "error" \| "warning"` (RULE-031) | `types.ts:13` | `src/main/FailOn.ts:51` (`Schema.Literal`) |
| return type `0 \| 1` | `:56` | `src/main/ExitCode.ts:18` (branded `Schema.Literal(0,1)`) |

The legacy `resolveExitCode` returned the bare literal `0 | 1`; the target returns
the **branded** `ExitCode` (`ExitCode.ts:18`) — runtime-erased, so it still compares
to plain `0`/`1` via `toBe`.

---

## 2. Deliberate deviations from legacy behavior

**There are NO behavioral deviations.** This is the headline difference from the
`score` slice (which pinned one rounding change). The exit-code gate is a pure
boolean/literal decision over a finite domain; the equivalence proof asserts
`modern === legacy` in every one of the 9 gate cells and 54 resolver cells and
counts `diverged === 0`. The changes below are at the **types/idiom** layer only and
are value- and wire-compatible.

### D1 — `failOn` switch → `effect/Match` (idiom; exhaustiveness preserved)
Legacy used a `switch (failOn)` with a `default: const _never: never = failOn`
exhaustiveness guard (`exit-code.ts:29-33`). The target uses `Match.value(failOn)`
with three `Match.when` arms closed by `Match.exhaustive` (`resolve.ts:51-55`).
`Match.exhaustive` is the idiomatic equivalent of the `never` check: it is a
compile-time **and** runtime totality guard — adding a fourth `FailOn` literal
without an arm is a type error, exactly preserving the legacy intent. The decision
values are identical.

### D2 — `FailOn` / `Severity` → `effect/Schema` literals
`FailOn` and `Severity` are `Schema.Literal(...)` (`FailOn.ts`) instead of bare TS
unions, giving callers a single runtime `decodeFailOn` gate for untrusted CLI/config
input (the brief's "model the contract as a Schema where it adds value"). The literal
*values* are preserved verbatim. The gate functions do **not** decode on the hot path
(kept pure & synchronous per the architecture-critic caveat) — they accept
already-typed values, matching legacy.

### D3 — return type `0 | 1` → branded `ExitCode`
`resolveExitCode` returns a branded `ExitCode = Schema.Literal(0, 1) & Brand`
(`ExitCode.ts:18`) instead of the bare literal, lifting RULE-030's `0 | 1`
postcondition into the type so a raw `number` can't be passed where a resolved code
is expected. The brand is runtime-erased; `PASS`/`FAIL` constants are returned
directly with no hot-path decode.

### D4 — `DEFAULT_FAIL_ON` exported from the contract
The default mode `"error"` (legacy parses it as the `flags.ts` default) is exported
as `DEFAULT_FAIL_ON` from the contract layer so the consumer CLI/config slice derives
its default from the contract instead of re-stating the string. No behavior change.

---

## 3. What was NOT migrated (and why)

- **The gate/resolver stayed plain, synchronous, pure functions — NOT `Effect`-wrapped.**
  Deliberate (Brief line 25/91 + architecture-critic caveat): a boolean/literal
  decision over an in-memory array gains nothing from a fiber and would cost the
  "performant / unit-testable" properties the legacy header explicitly calls out.
  Effect appears only in the contract types (`Schema` literals, branded `ExitCode`)
  and `Match` for the dispatch.
- **The process edge was NOT migrated** (out of scope for this surgical slice):
  `cli.ts:51-84` owns `process.exitCode = …`, the SIGINT/SIGTERM → 130 handlers, the
  stdout EPIPE → 0 handler, and the uncaught-error `catch → 1` + stderr message
  (RULE-030's signal/pipe edge cases). The legacy header is explicit that those live
  at the process edge, not in this pure module — this slice preserves that boundary.
  The signal/EPIPE codes (130 / 0) are therefore intentionally absent here.
- **No dead code was dropped from `exit-code.ts`** — every line is live within this
  module. The `hadError` *param* is preserved (see Follow-up F1); its dead-branch
  removal is a consumer-wiring decision, not this pure module's to make.
- **`Diagnostic` was not vendored as a full Schema** (unlike the `score` slice). The
  gate genuinely reads only `severity`, so the input is typed as
  `ReadonlyArray<{ severity: Severity }>` (`Pick<Diagnostic, "severity">` per the
  spec). Pulling in the whole `Diagnostic`/`Fix`/`TextEdit` contract would be
  unjustified surface for a one-field reader; the `score` slice owns that contract and
  it migrates to `@tsnuke/rules` (its Follow-up #3).

---

## 4. Follow-ups for the consumer / next module(s)

These record RULE-030's suspected wiring defects (BUSINESS_RULES.md:542,
SME question #6). **This pure module was deliberately NOT changed** to fix them —
they are consumer-wiring decisions.

1. **F1 — `hadError` branch is effectively dead (consumer-wiring).** `runInspect`
   never passes `hadError`, so the `hadError === true → 1` branch (`resolve.ts:89`)
   never fires in production: an uncaught error instead reaches `cli.ts`'s catch
   (`cli.ts:78-84`), which also sets exit 1. Behavior is therefore *correct* (both
   paths yield 1), but the branch is unreachable via the live wiring. **Decision for
   the engine/CLI slice:** either (a) wire `runInspect` to pass `hadError` and let the
   resolver own the error→1 mapping, or (b) drop the `hadError` param and keep the
   `cli.ts` catch as the single error→1 site. The param is **preserved here for now**
   so this slice is a faithful, drop-in equivalent; its removal is the consumer's call.

2. **F2 — `config.failOn` is currently inert (consumer-wiring).** `config.failOn` is
   parsed and validated (RULE-024, `load-config.ts`) but the inspect path reads only
   the CLI `--fail-on` flag, so a `failOn` set in `tsnuke.config.json` never reaches
   this resolver. **Decision for the CLI slice:** resolve the effective `failOn` as
   `cliFlag ?? config.failOn ?? DEFAULT_FAIL_ON` before calling `resolveExitCode`, then
   pass the single resolved value in. `DEFAULT_FAIL_ON` is exported (D4) to support
   exactly this precedence chain. This module is correct regardless of which source
   feeds it; the fix is purely in how the consumer computes the `failOn` argument.

3. **F3 — process-edge migration (signals / EPIPE / uncaught catch).** When the
   `cli.ts` slice is modernized, port the SIGINT/SIGTERM → 130, stdout EPIPE → 0, and
   uncaught-error → 1-with-stderr edges (RULE-030). They belong at the process edge,
   above this module; this slice intentionally stops at the `0 | 1` resolution.

4. **F4 — de-duplicate `Severity` / `FailOn` ownership.** `Severity` is vendored both
   here (`FailOn.ts:51`) and in the `score` slice (`Diagnostic.ts:21`). When the
   `@tsnuke/rules` Effect slice lands (the `score` slice's Follow-up #3), both
   should import `Severity` from it. `FailOn` ownership belongs to the CLI/flags slice
   (`flags.ts:14`); when that lands, import `FailOn` from there and delete the local
   `Schema.Literal`.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written to match the `score` reference slice exactly. A more TS-idiomatic layout
  would co-locate `*.test.ts` beside sources; not changed, to respect the convention.
- **Contract split into `FailOn.ts` + `ExitCode.ts`, logic in `resolve.ts`.** Mirrors
  the `score` slice's `Score.ts` (contract) + `Scoring.ts` (logic) split: the
  Schema/branded types live in the contract files, the pure dispatch in `resolve.ts`,
  re-exported through the `index.ts` barrel.
- **Tests written FIRST** (RED before impl), then `src/main` implemented to satisfy
  them with zero edits to the test files — per the strangler-fig process.
- **Run:** `cd modernized/exit-code/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (25 tests)

| File | Tests | Covers |
|------|------:|--------|
| `shouldFailForDiagnostics.test.ts` | 11 | RULE-030 gate: each `failOn` × {empty, warnings-only, has-error, errors-only} |
| `resolveExitCode.test.ts` | 12 | RULE-030 resolver precedence: `hadError` {true/false/undefined} × `scoreMode` × gate; `0\|1` result |
| `equivalence.test.ts` | 2 | Differential proof vs vendored frozen legacy oracle: full 3×3 gate grid (9 cells) + full 3×3×2×3 resolver product (54 cells), `diverged === 0` |

The equivalence proof enumerates the **entire finite input space** (no sampling),
asserts `modern === legacy` in every cell, and guards the traversal counts
(`compared === 9` / `=== 54`) so an empty grid cannot pass silently. Because the
exit-code decision has no rounding, the expected and observed divergence count is
exactly **0** — full byte-for-byte parity with legacy.

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `filter-pipeline` and `build-report` slices. **No HIGH findings.**
The critic confirmed the branded `ExitCode` IS enforced at the public seam
(`resolveExitCode(): ExitCode`) — the *mirror image* of the score slice's original H1
(where the brand was bypassed) — and that the `hadError` dead-branch is correctly
preserved-and-noted (F1), not silently dropped. The proof is the strongest of the four
slices: the **entire** finite input space is enumerated.

**Applied:**
- **Dropped `makeExitCode` from the public barrel (MEDIUM).** A two-value domain has no
  meaningful trust boundary to decode at, and the validating constructor had no caller
  or test — publishing it was ceremony (the score slice's barrel-hygiene lesson). It
  stays defined in `ExitCode.ts`; it is simply not re-exported from `index.ts`.

**Recorded, no change:**
- `Match.exhaustive` over three string literals (`resolve.ts`) is a **lateral move**, not
  an improvement, vs the legacy `switch` + `never` guard (already total at compile time).
  Kept as idiomatic Effect, flagged so it isn't cargo-culted onto a perf-sensitive hot path.
- The branded `ExitCode` (over `Schema.Literal(0, 1)`) is the **weakest-value brand** of
  the four slices; kept because it IS enforced at the return seam, but noted as borderline.
