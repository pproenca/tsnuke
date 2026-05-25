# Transformation Notes — `scale` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke scale effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/core/src/scale.ts` (126 lines).
Target: `modernized/scale/effect/` (package `@tsnuke/scale-effect`).

Two cleanly-separated halves:
- **RULE-013** — Tier-2 memory-ceiling guard: kept a **PURE** synchronous predicate.
- **RULE-036** — `ts.Program` create-and-never-dispose: the dormant disposal seam
  re-expressed as idiomatic Effect **`Scope`** (`Effect.acquireRelease` /
  `acquireUseRelease`). The brief's "Program acquired via Scope — RULE-013/036 cured".

Verified by **29 characterization tests** (incl. a 73,210-triple zero-divergence
memory-guard equivalence grid and a legacy try/finally event-sequence oracle for
disposal).

**Result:** 29/29 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `scale.ts` | Target |
|----------|-------------------|--------|
| `DEFAULT_TIER2_MEMORY_CEILING_BYTES = 2e9` (tunable, RULE-013) | `:110` | `src/main/memory.ts:38` |
| `shouldSkipTier2ForMemory(rss, est, ceiling)` — pure `>` (RULE-013) | `:119-125` | `src/main/memory.ts:66-72` |
| `DisposableResource<T>` + idempotent `dispose()` (RULE-036) | `:43-75` | folded into Effect finalizers (see D2) |
| `Symbol.dispose` / `using` runtime install | `:33-34, :69-73` | dropped — Effect `Scope` owns lifecycle (D2) |
| `withDisposable(value, dispose)` | `:58-75` | `src/main/scope.ts:67-73` `scopedProgram` (`Effect.acquireRelease`) |
| `withDisposableProgram(key, build, dispose, fn)` try/finally | `:91-103` | `src/main/scope.ts:102-110` `withProgram` (`Effect.acquireUseRelease`) |

The legacy `key`/`build` split (`build: (key) => TProgram`) collapses into a single
`acquire: Effect<P, E, R>` — callers that built from a key now close over it. Legacy
`dispose: (program) => void` widens to `(program) => void | Effect<void>` so callers
can supply an effectful cleanup (e.g. disposing a builder host that does IO).

---

## 2. Deliberate deviations from legacy behavior

### D1 — Memory guard: NO deviation (verbatim) ✅
Unlike the `score` slice (which pinned a half-up → half-even rounding change),
**RULE-013's formula is carried over byte-for-byte**: `rss + est > ceiling`, strict
`>`, no clamping. The exhaustive equivalence grid (73,210 triples) asserts **zero
divergence** from the vendored legacy oracle. The only modeling choice is that the
ceiling stays a plain tunable `const` (NOT frozen/branded) — faithful to legacy's
"explicitly NOT frozen like the score weights" comment (`scale.ts:107-109`): it's an
environment limit, not a determinism rule (RULE-041 does not apply to it).

### D2 — Disposal: hand-rolled `using`/`Symbol.dispose` → Effect `Scope` (structural) ⚙️
Legacy hand-rolls the TS 5.2 `using` / `Symbol.dispose` convention: a
`DisposableResource<T>` carrying an idempotent `dispose()` (a `disposed` boolean
guard) installed under the well-known `Symbol.dispose`, consumed by a `try/finally`
in `withDisposableProgram`. The target stack is Effect, so this entire machinery is
**replaced** by `Effect.acquireRelease` (→ a `Scope` finalizer, `scopedProgram`) and
`Effect.acquireUseRelease` (→ bracketed acquire-use-release, `withProgram`). The
`disposed`-flag idempotence and the `finally`-guaranteed cleanup are now provided by
the Effect runtime, not re-implemented by hand. **No `Symbol.dispose` symbol, no
`using` keyword, no manual `try/finally` in the target.**

### D3 — Interruption-safety: a STRENGTHENING superset over legacy ⚠️ (the headline)
This is the one place the modern behavior is intentionally *broader* than legacy —
a deliberate, beneficial behavioral **superset** (documented here the way the `score`
slice documented its rounding deviation, but note this one *adds* a guarantee rather
than changing an output).

- **Legacy `try/finally`** guarantees `dispose` runs after `fn` on **success** and on
  **throw**. That is all a synchronous `try/finally` can structurally express.
- **Effect's finalizer** guarantees release on **success**, on **failure (error
  channel)**, on **defect (unexpected throw / die)**, AND on **interruption** (fiber
  cancellation, timeout, losing a race). Release runs **exactly once, after use,
  always**, and runs **uninterruptibly** (it cannot itself be cut short).
- **Why it matters for RULE-036:** the whole point of the disposal seam is "release
  the Program before the next project's build, so we never hold N Programs resident"
  (the monorepo-OOM fix). If a deep run is cancelled or times out mid-project, the
  legacy `using`/`finally` path *does* still release on a synchronous unwind — but the
  moment that orchestration moves onto Effect fibers (timeouts, `Effect.race`,
  structured concurrency), interruption becomes a real, distinct exit that a
  try/finally written against Promises cannot reliably cover. Effect closes that gap
  by construction.
- **Test evidence:** `scopedProgram.test.ts` forks `withProgram`, blocks inside
  `use`, `Fiber.interrupt`s it, and asserts `Exit.isInterrupted` AND that release ran
  exactly once. The legacy equivalence oracle (`equivalence.test.ts`) covers only
  SUCCESS + THROW because **legacy cannot express interruption** — that case is
  asserted modern-only, as a strict superset.

> If a consumer ever needs to suppress release on interruption (it shouldn't —
> leaking a Program on cancel is the bug RULE-036 fixes), that would be a one-line
> change to use `Effect.ensuring` with an exit predicate, isolated in `scope.ts`.

### D4 — Pure/effectful split preserved deliberately
RULE-013 stays a **plain synchronous function** (no `Effect`); RULE-036 returns real
`Effect<...>` values. This mirrors the `score` slice's pure-core discipline and the
brief's explicit "don't over-apply Effect; don't wrap the pure memory check". The RSS
is **injected** into `shouldSkipTier2ForMemory` (no `process.memoryUsage()` read), so
the pure function has no IO to sequence — wrapping it in a fiber would buy nothing.

---

## 3. What was NOT migrated (and why)

- **The `DisposableResource<T>` type and the `Symbol.dispose` / `using` runtime
  install are GONE** (subsumed by Effect `Scope`, D2) — not re-exported, not vendored.
  Callers on the Effect stack acquire via `scopedProgram` / `withProgram` instead of
  holding a `DisposableResource`. (Legacy callers using `.value` / `using` must
  migrate to the Effect forms — see Follow-ups.)
- **No real `ts.Program` build was wired.** Legacy's `build`/`dispose` were already
  injected seams (`scale.ts:84-89` "PENDING: wire to a real `ts.createProgram`"); this
  slice keeps `acquire`/`release` injected too. Wiring the real Program belongs to the
  engine slice (Follow-up #1).
- **The legacy module's long WHY-NOT-BINARY-SPLIT preamble** (`scale.ts:1-25`, about
  react-doctor's `ceil(len/2)` batch split being a no-op in-process) is design
  rationale, not behavior — summarized in the module headers, not ported as code.
- **No consumers were touched** (out of scope for this surgical slice): the engine
  (`core/src/engine.ts:194-205`) still builds its Program with no disposal and no
  memory check. That is the dormancy this slice exists to cure — see Follow-ups.

---

## 4. Follow-ups for the next module(s) that depend on this one

1. **Wire RULE-036 into the engine (the actual cure).** `runEngine`
   (`engine.ts:194-205`) builds one `ts.Program` per project and never disposes it
   (RULE-036 confirmed defect). Replace that with `withProgram(acquire, use, release)`
   — `acquire = Effect.sync(() => buildProgramFromFiles(files))`, `use` = the
   type-check + Tier-1 reuse + Tier-2 checker, `release = (p) => /* drop the program +
   builder host */`. The Program is then released **before the next project's build** —
   never N resident. (Or `scopedProgram` inside an `Effect.scoped` per-project loop.)
2. **Wire RULE-013 BEFORE the Program build, which legacy NEVER did.** RULE-013 is
   unwired dead code in legacy — `runEngine` builds the Program unconditionally with no
   memory check. The engine should, before `acquire`, read live RSS and call
   `shouldSkipTier2ForMemory(process.memoryUsage().rss, estimate)`; if `true`, **skip
   the Tier-2 Program build entirely** and set `scorePartial = true` (degrade
   gracefully rather than OOM). RSS is read **at the call site** (keeping the function
   pure); the estimate is the engine's to compute.
3. **`scorePartial` honesty:** when RULE-013 skips Tier-2, the engine must flag the run
   partial (RULE-018) — same scale, only flagged not-comparable. This flag lives on the
   engine result, not on this slice (mirrors the `score` slice's partial-free contract).
4. **De-vendor the `Diagnostic`/contract dependency:** this slice has none (it is
   contract-free — pure numbers + injected Program), so nothing to de-vendor. Noted for
   symmetry with the `score` slice's Follow-up.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (same as the `score` slice).
- **`@effect/vitest` is back in devDeps** (the `score` slice dropped it because its
  pure functions had no `Effect<...>` values to test). Here Part B produces real
  `Effect<...>`, so `it.effect` / `it.scoped` are the correct test runners — Part A's
  pure predicate still uses plain `vitest`.
- **Equivalence oracles are vendored frozen copies** of legacy `scale.ts` (the memory
  formula `:110-125`; `withDisposable`/`withDisposableProgram` `:58-103`) inside
  `equivalence.test.ts` — for differential testing only; never "fixed".
- **`.js` specifiers on relative imports** (`../main/index.js`) resolved to `.ts` by
  `Bundler` moduleResolution, per the legacy convention.
- **Run:** `cd modernized/scale/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (32 tests)

| File | Tests | Covers |
|------|-------|--------|
| `shouldSkipTier2ForMemory.test.ts` | 13 | RULE-013 boundary trio (`<`/`===`/`>`), default & custom ceiling, degenerate inputs |
| `scopedProgram.test.ts` | 13 | RULE-036 success / failure / defect / **interruption** (both `withProgram` AND `scopedProgram`) / **acquire-fails → release NEVER runs** / idempotence; Effect-returning release |
| `equivalence.test.ts` | 6 | RULE-013 zero-divergence grid (73,210 triples) + RULE-036 legacy try/finally event-sequence oracle (SUCCESS + THROW) |

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `config` loader and `engine-plan` slices. **No HIGH findings.** The
critic confirmed `shouldSkipTier2ForMemory` is byte-identical to legacy (strict `>`, RSS
injected, not Effect-wrapped, `===` does-not-skip pinned), the interruption-safety framing is
a correct beneficial *superset* (not an unflagged change), and RULE-013/036 dormancy is
loudly documented as the engine-slice follow-up.

**Applied (closing two real lifecycle corners — MEDIUM):**
- **Acquire-failure path pinned (both entry points).** The dual of "release always runs" is
  "release runs ONLY if acquire succeeded." Added tests where `acquire = Effect.fail(...)` for
  both `withProgram` and `scopedProgram`, asserting `releaseCount === 0` and the error
  surfaces — so a refactor that registered the finalizer before acquire would fail CI.
- **`scopedProgram` interruption pinned.** Interruption was tested for `withProgram` but not
  `scopedProgram` — yet `scopedProgram` is the Scope entry point the engine's per-project
  `Effect.scoped` loop will use. Added a matching interrupt-during-use test (release runs once).

**Recorded, no change (LOW):** the "release runs *uninterruptibly*" claim is a true property of
Effect finalizers and is documented (D3) but not separately pinned by a test that makes the
release itself yield under interruption — optional, since it's a framework guarantee.
