/**
 * Resource disposal for the scale slice — the EFFECTFUL half (RULE-036).
 *
 * THE LEGACY SEAM (`scale.ts:43-103`):
 *   Legacy hand-rolls the TS 5.2 `using` / `Symbol.dispose` convention. A
 *   `DisposableResource<T>` wraps a value + an idempotent `dispose()`;
 *   `withDisposableProgram(key, build, dispose, fn)` builds a Program, runs `fn`,
 *   and disposes in a `finally` so the Program is released even if `fn` throws.
 *   That guarantee — "build Program, use it, drop it BEFORE the next project's
 *   build" — is the monorepo-OOM fix (RULE-036): never hold N Programs resident.
 *
 * WHY THIS BECOMES IDIOMATIC EFFECT `Scope`:
 *   The target stack is Effect, and resource lifecycle is exactly what
 *   `Effect.acquireRelease` / `Effect.acquireUseRelease` / `Scope` exist for. So we
 *   drop the hand-rolled `using` machinery and express the same contract natively.
 *   This is genuinely effectful — returning `Effect<...>` here is CORRECT (unlike
 *   the pure memory guard in {@link ./memory.ts}, which stays a plain function).
 *
 * THE CONTRACT PRESERVED — AND STRENGTHENED:
 *   Legacy's try/finally guarantees `dispose` runs after `fn` on SUCCESS and on
 *   THROW. Effect's finalizer guarantees the same and ADDS the case a try/finally
 *   structurally cannot express: release also runs on INTERRUPTION (fiber
 *   cancellation / timeout / racing). Across all three exits — success, failure
 *   (error channel), interruption — release runs EXACTLY ONCE, AFTER use, and
 *   ALWAYS. Disposal is idempotent. This interruption-safety is a deliberate,
 *   beneficial behavioral SUPERSET of legacy; see TRANSFORMATION_NOTES §2.
 *
 * See BUSINESS_RULES.md RULE-036 and legacy `packages/core/src/scale.ts:43-103`.
 */

import { Effect, type Scope } from "effect";

/**
 * Normalize a caller-supplied release into an Effect.
 *
 * The legacy `dispose: (program) => void` callback is synchronous. Callers
 * migrating that as-is pass a plain `void`-returning function; callers already on
 * Effect can return an `Effect<void>` (e.g. to dispose a builder host that itself
 * does IO). We accept BOTH and lift the sync form with `Effect.sync` so a thrown
 * error inside a sync release is captured into the finalizer rather than escaping.
 */
const toReleaseEffect = <P>(
  release: (program: P) => void | Effect.Effect<void>,
) => {
  return (program: P): Effect.Effect<void> => {
    const result = release(program);
    return Effect.isEffect(result) ? result : Effect.sync(() => result);
  };
};

/**
 * Acquire a Program into the current {@link Scope.Scope}, registering `release` as
 * a finalizer — the Effect-native form of legacy `withDisposable` (RULE-036).
 *
 * The returned Effect yields the acquired `P` and carries `Scope.Scope` in its
 * requirements. The `release` finalizer runs when that Scope closes — on success,
 * on failure, AND on interruption — exactly once. Compose with `Effect.scoped` (or
 * an `it.scoped` test) to bound the Scope; the Program is then guaranteed disposed
 * before control leaves that boundary, so it never lingers into the next project's
 * build (the monorepo memory fix).
 *
 * Use this when you want the Program to live for the rest of an `Effect.gen` block
 * and be released at the end of the scope. For the bracketed
 * "acquire → use → release" shape, prefer {@link withProgram}.
 *
 * @param acquire  Effect that builds the Program (in production: `ts.createProgram`).
 * @param release  Cleanup for the Program; sync (`void`) or `Effect<void>`. Run as
 *                 a Scope finalizer, uninterruptibly, exactly once.
 * @returns `Effect<P, E, R | Scope.Scope>` — the Program, scoped.
 */
export const scopedProgram = <P, E, R>(
  acquire: Effect.Effect<P, E, R>,
  release: (program: P) => void | Effect.Effect<void>,
): Effect.Effect<P, E, R | Scope.Scope> => {
  const releaseEffect = toReleaseEffect(release);
  return Effect.acquireRelease(acquire, (program) => releaseEffect(program));
};

/**
 * Build a Program, run `use` with it, and release it afterward — the Effect-native
 * form of legacy `withDisposableProgram(key, build, dispose, fn)` (RULE-036).
 *
 * This is the direct one-to-one replacement for the legacy try/finally orchestration
 * and does NOT require a `Scope` in its result type (the resource lifetime is fully
 * bounded by `use`). `release` runs AFTER `use` completes — on success, on failure,
 * and on interruption — exactly once. The legacy `key`/`build` split collapses into
 * a single `acquire` Effect (callers that built from a key now close over it).
 *
 * Equivalence to legacy on the cases legacy can express:
 *   - `use` returns       → result returned, `release` ran (legacy `finally`).
 *   - `use` fails/throws  → error propagates, `release` ran (legacy `finally`).
 *   - `use` is interrupted → `release` ran (legacy try/finally CANNOT express this;
 *                            modern-only superset, see TRANSFORMATION_NOTES §2).
 *
 * @param acquire  Effect that builds the Program.
 * @param use      Effect-producing function that consumes the Program.
 * @param release  Cleanup; sync (`void`) or `Effect<void>`. Run after `use`,
 *                 uninterruptibly, exactly once.
 * @returns `Effect<A, E | E2, R | R2>` — the result of `use`, with disposal guaranteed.
 */
export const withProgram = <P, E, R, A, E2, R2>(
  acquire: Effect.Effect<P, E, R>,
  use: (program: P) => Effect.Effect<A, E2, R2>,
  release: (program: P) => void | Effect.Effect<void>,
): Effect.Effect<A, E | E2, R | R2> => {
  const releaseEffect = toReleaseEffect(release);
  return Effect.acquireUseRelease(acquire, use, (program) =>
    releaseEffect(program),
  );
};
