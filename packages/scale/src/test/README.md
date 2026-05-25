# Characterization tests — `scale` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-fix`'s scale
guard. The implementation lives at `src/main/*` (imported as `../main/index.js` —
`.js` on relative specifiers, per the legacy convention; the `Bundler`
moduleResolution in `tsconfig.json` resolves `.js` to `.ts`).

The legacy module is the oracle (`legacy/ts-fix/packages/core/src/scale.ts`,
read-only). We prove *equivalence first*. Unlike the `score` slice, **Part A has
NO deliberate behavioral deviation** — the memory formula is carried over verbatim
with zero divergence. The one structural change is in Part B: the hand-rolled
`using` / `Symbol.dispose` try/finally becomes idiomatic Effect `Scope` — and the
modern contract is a *superset* (it also covers interruption).

## Two halves, two test styles

| Half | Rule | What | Effect? | Test files |
|------|------|------|---------|------------|
| A — memory guard | RULE-013 | `shouldSkipTier2ForMemory(rss, est, ceiling=DEFAULT) = rss + est > ceiling` (STRICT `>`) | **No** — plain pure fn | `shouldSkipTier2ForMemory.test.ts`, `equivalence.test.ts` (Part A) |
| B — disposal seam | RULE-036 | `scopedProgram` (`Effect.acquireRelease`) + `withProgram` (`Effect.acquireUseRelease`); release runs once, after use, ALWAYS | **Yes** — real `Effect<...>` | `scopedProgram.test.ts`, `equivalence.test.ts` (Part B) |

Part A uses **plain `vitest`** (the function is a synchronous predicate — the Brief
says do not wrap the pure memory check in Effect). Part B uses **`@effect/vitest`**
(`it.effect` / `it.scoped`) because those are genuine `Effect<...>` values.

## Part A — RULE-013 (memory ceiling), no deviation

`shouldSkipTier2ForMemory.test.ts` pins the boundary trio — sum **<** / **===** /
**>** ceiling. The comparison is **strict** (`>`), so a sum *equal* to the ceiling
does **NOT** skip; that is the one thing that distinguishes a correct `>` from a
`>=` bug, and it is asserted at both a small custom ceiling and the default.
Default-ceiling-when-omitted and custom-ceiling override are both covered, plus
degenerate inputs (zero ceiling, single-byte overflow — pure additive, no clamping).

`equivalence.test.ts` (Part A) vendors a **frozen copy** of legacy
`shouldSkipTier2ForMemory` (`scale.ts:110-125`) and asserts **zero divergence**
over an exhaustive boundary-rich grid: ceilings `{0,1,50,100,1000}` ×
`rss ∈ [0,120]` × `est ∈ [0,120]` (73,210 triples) plus the default-ceiling
overload. A harness guard asserts the skip branch actually fired.

## Part B — RULE-036 (disposal), legacy contract + interruption superset

`scopedProgram.test.ts` pins the lifecycle contract on both entry points:

- **SUCCESS** — release runs exactly once, **after** use; result returned.
- **FAILURE** — `use` fails on the error channel; release **still ran once**
  (asserted via `Effect.exit` / `runPromiseExit`-style inspection).
- **DEFECT** — `use` throws an unexpected error (dies); release **still ran once**.
- **INTERRUPTION** — `use` is interrupted mid-flight (fork → block → `Fiber.interrupt`);
  release **still ran once**. *This is the case legacy's try/finally cannot express*
  — a deliberate Effect superset.
- **IDEMPOTENCE** — a guarded release (legacy's `disposed` flag) is invoked exactly
  once; sequential acquires in one scope each finalize exactly once.
- `scopedProgram` also tested under an **explicit `Effect.scoped`** boundary and
  with an **Effect-returning release** (async-style cleanup).

`equivalence.test.ts` (Part B) vendors a frozen copy of legacy `withDisposable` +
`withDisposableProgram` (`scale.ts:58-103`) and asserts the modern `withProgram`
reproduces the **same observable event sequence** (`build → use → dispose`) as the
legacy try/finally on the two cases legacy *can* express: **SUCCESS** and **THROW**
(dispose after fn, even when fn throws). Interruption is asserted **modern-only**
in `scopedProgram.test.ts` — legacy has no oracle for it.

## Running

```sh
cd modernized/scale/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/tsc --noEmit        # typecheck
```

## Public surface these tests expect (write the impl to match)

```ts
import { Effect, type Scope } from "effect";
import {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES, // 2_000_000_000 (TUNABLE, not frozen)
  shouldSkipTier2ForMemory,           // (rss, est, ceiling=DEFAULT) => boolean  PURE
  scopedProgram,                      // (acquire: Effect<P,E,R>, release) => Effect<P, E, R | Scope.Scope>
  withProgram,                        // (acquire, use, release) => Effect<A, E|E2, R|R2>
} from "../main/index.js";
```

- `shouldSkipTier2ForMemory` is a **plain synchronous predicate** — NOT `Effect`-wrapped.
- `scopedProgram` is `Effect.acquireRelease` — yields the Program, requires a `Scope`.
- `withProgram` is `Effect.acquireUseRelease` — bounded acquire→use→release, no `Scope` in the result.
- Both `release` callbacks accept `(program) => void | Effect<void>`.
- Disposal runs **exactly once, after use, always** (success / failure / interruption).
