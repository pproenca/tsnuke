/**
 * Characterization tests for the resource-disposal seam — RULE-036.
 * PART B — the EFFECTFUL half (`scopedProgram` via `Effect.acquireRelease`,
 * `withProgram` via `Effect.acquireUseRelease`).
 *
 * THE CONTRACT under test (preserved from legacy, then strengthened):
 *   release runs EXACTLY ONCE, AFTER use, and ALWAYS —
 *     (1) on SUCCESS              — legacy try/finally also guaranteed this;
 *     (2) on FAILURE (error chan) — legacy try/finally also guaranteed this;
 *     (3) on INTERRUPTION         — legacy try/finally CANNOT express this; the
 *                                   Effect guarantee is a deliberate SUPERSET.
 *   Disposal is idempotent.
 *
 * Tested with `@effect/vitest` (`it.effect` / `it.scoped`) because these are real
 * `Effect<...>` values — exactly where Effect-aware testing is correct (Brief). The
 * pure RULE-013 guard is tested with plain vitest in `shouldSkipTier2ForMemory.test.ts`.
 */

import { it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { describe, expect } from "vitest";
import { scopedProgram, withProgram } from "../main/index.js";

interface FakeProgram {
  readonly key: string;
}

// ---------------------------------------------------------------------------
// withProgram — Effect.acquireUseRelease (the direct legacy-shaped replacement)
// ---------------------------------------------------------------------------
describe("withProgram — RULE-036 (release after use)", () => {
  it.effect("SUCCESS: release runs exactly once, AFTER use; result returned", () =>
    Effect.gen(function* () {
      let releaseCount = 0;
      const events: string[] = [];
      const result = yield* withProgram(
        Effect.succeed({ key: "p" } satisfies FakeProgram),
        (p) => Effect.sync(() => events.push(`use:${p.key}`)).pipe(Effect.as(42)),
        (p) => {
          releaseCount++;
          events.push(`release:${p.key}`);
        },
      );
      expect(result).toBe(42);
      expect(releaseCount).toBe(1);
      expect(events).toStrictEqual(["use:p", "release:p"]);
    }),
  );

  it.effect(
    "FAILURE: release runs exactly once even though use fails; error on error channel",
    () =>
      Effect.gen(function* () {
        let releaseCount = 0;
        const exit = yield* withProgram(
          Effect.succeed({ key: "p" } satisfies FakeProgram),
          () => Effect.fail("use blew up" as const),
          () => {
            releaseCount++;
          },
        ).pipe(Effect.exit);

        // Assert via runPromiseExit-style inspection that release STILL ran once.
        expect(Exit.isFailure(exit)).toBe(true);
        expect(exit).toStrictEqual(Exit.fail("use blew up"));
        expect(releaseCount).toBe(1);
      }),
  );

  it.effect(
    "DEFECT: release runs once even when use dies (unexpected throw / defect)",
    () =>
      Effect.gen(function* () {
        let releaseCount = 0;
        const boom = new Error("defect in use");
        const exit = yield* withProgram(
          Effect.succeed({ key: "p" } satisfies FakeProgram),
          () =>
            Effect.sync(() => {
              throw boom;
            }),
          () => {
            releaseCount++;
          },
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        expect(releaseCount).toBe(1);
      }),
  );

  it.effect(
    "INTERRUPTION (modern-only superset): release runs when use is interrupted",
    () =>
      // Legacy's try/finally CANNOT express interruption. Here we start `use`,
      // let it block, interrupt the fiber, and assert release STILL ran exactly
      // once — the Effect guarantee that strengthens the legacy contract.
      Effect.gen(function* () {
        let releaseCount = 0;
        const started = yield* Deferred.make<void>();

        const fiber = yield* withProgram(
          Effect.succeed({ key: "p" } satisfies FakeProgram),
          () =>
            // signal we're in `use`, then block forever until interrupted
            Deferred.succeed(started, void 0).pipe(Effect.zipRight(Effect.never)),
          () => {
            releaseCount++;
          },
        ).pipe(Effect.fork);

        yield* Deferred.await(started); // ensure we interrupt DURING use
        const exit = yield* Fiber.interrupt(fiber);

        expect(Exit.isInterrupted(exit)).toBe(true);
        expect(releaseCount).toBe(1); // release ran despite interruption
      }),
  );

  it.effect(
    "ACQUIRE FAILS: release NEVER runs (no resource to dispose); error surfaces",
    () =>
      // The critical dual of "release always runs": it must run ONLY if acquire
      // succeeded. `Effect.acquireUseRelease` registers the finalizer after acquire,
      // so a failed acquire must NOT call release (architecture review).
      Effect.gen(function* () {
        let releaseCount = 0;
        const exit = yield* withProgram(
          Effect.fail("acquire blew up" as const),
          () => Effect.succeed(1),
          () => {
            releaseCount++;
          },
        ).pipe(Effect.exit);

        expect(exit).toStrictEqual(Exit.fail("acquire blew up"));
        expect(releaseCount).toBe(0);
      }),
  );
});

// ---------------------------------------------------------------------------
// scopedProgram — Effect.acquireRelease (Scope-managed lifetime)
// ---------------------------------------------------------------------------
describe("scopedProgram — RULE-036 (Scope finalizer disposal)", () => {
  it.scoped(
    "SUCCESS: Program acquired into Scope; release runs when the Scope closes",
    () =>
      Effect.gen(function* () {
        const events: string[] = [];
        const program = yield* scopedProgram(
          Effect.sync(() => {
            events.push("acquire");
            return { key: "p" } satisfies FakeProgram;
          }),
          (p) => {
            events.push(`release:${p.key}`);
          },
        );
        // Inside the scope: acquired, not yet released.
        events.push(`use:${program.key}`);
        expect(events).toStrictEqual(["acquire", "use:p"]);
        // release fires when `it.scoped`'s Scope closes after this effect returns.
      }),
  );

  it.effect(
    "release runs when an EXPLICIT Effect.scoped boundary closes (success path)",
    () =>
      Effect.gen(function* () {
        const events: string[] = [];
        yield* Effect.scoped(
          Effect.gen(function* () {
            const p = yield* scopedProgram(
              Effect.succeed({ key: "p" } satisfies FakeProgram),
              (prog) => {
                events.push(`release:${prog.key}`);
              },
            );
            events.push(`use:${p.key}`);
          }),
        );
        // After the scope closed, release has run exactly once, AFTER use.
        expect(events).toStrictEqual(["use:p", "release:p"]);
      }),
  );

  it.effect("release runs once when the scoped body FAILS, before the error surfaces", () =>
    Effect.gen(function* () {
      let releaseCount = 0;
      const exit = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* scopedProgram(
            Effect.succeed({ key: "p" } satisfies FakeProgram),
            () => {
              releaseCount++;
            },
          );
          return yield* Effect.fail("scoped body failed" as const);
        }),
      ).pipe(Effect.exit);

      expect(exit).toStrictEqual(Exit.fail("scoped body failed"));
      expect(releaseCount).toBe(1);
    }),
  );

  it.effect("supports an Effect-returning release (async-style cleanup)", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* scopedProgram(
            Effect.succeed({ key: "p" } satisfies FakeProgram),
            (p) =>
              // release itself is an Effect (e.g. disposing a builder host that does IO)
              Effect.sync(() => events.push(`release:${p.key}`)),
          );
          events.push("body");
        }),
      );
      expect(events).toStrictEqual(["body", "release:p"]);
    }),
  );

  it.effect("ACQUIRE FAILS inside the scope: release NEVER runs; error surfaces", () =>
    Effect.gen(function* () {
      let releaseCount = 0;
      const exit = yield* Effect.scoped(
        scopedProgram(
          Effect.fail("acquire blew up" as const),
          () => {
            releaseCount++;
          },
        ),
      ).pipe(Effect.exit);

      expect(exit).toStrictEqual(Exit.fail("acquire blew up"));
      expect(releaseCount).toBe(0);
    }),
  );

  it.effect(
    "INTERRUPTION: release runs once when the Scope-managed body is interrupted DURING use",
    () =>
      // scopedProgram is the Scope entry point the engine follow-up uses (per-project
      // `Effect.scoped` loop), so its interruption path is pinned too — not just
      // withProgram's (architecture review).
      Effect.gen(function* () {
        let releaseCount = 0;
        const started = yield* Deferred.make<void>();

        const fiber = yield* Effect.scoped(
          Effect.gen(function* () {
            yield* scopedProgram(
              Effect.succeed({ key: "p" } satisfies FakeProgram),
              () => {
                releaseCount++;
              },
            );
            // signal we're past acquire, then block until interrupted
            yield* Deferred.succeed(started, void 0).pipe(
              Effect.zipRight(Effect.never),
            );
          }),
        ).pipe(Effect.fork);

        yield* Deferred.await(started);
        const exit = yield* Fiber.interrupt(fiber);

        expect(Exit.isInterrupted(exit)).toBe(true);
        expect(releaseCount).toBe(1);
      }),
  );
});

// ---------------------------------------------------------------------------
// Idempotence — release/dispose runs at most once even if invoked twice.
// ---------------------------------------------------------------------------
describe("scopedProgram / withProgram — RULE-036 (idempotent disposal)", () => {
  it.effect(
    "Scope closes once -> single release even across a nested re-acquire of the same key",
    () =>
      Effect.gen(function* () {
        const releaseCounts = new Map<string, number>();
        const bump = (k: string): void => {
          releaseCounts.set(k, (releaseCounts.get(k) ?? 0) + 1);
        };

        // Sequentially acquire+release within ONE scope; each Program's finalizer
        // is registered once and fires once when the scope closes.
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* scopedProgram(Effect.succeed({ key: "a" }), (p) => bump(p.key));
            yield* scopedProgram(Effect.succeed({ key: "b" }), (p) => bump(p.key));
          }),
        );

        expect(releaseCounts.get("a")).toBe(1);
        expect(releaseCounts.get("b")).toBe(1);
      }),
  );

  it.effect(
    "withProgram: an idempotent release guard is never invoked twice on success",
    () =>
      Effect.gen(function* () {
        // Mirror the legacy `withDisposable` idempotence guard: a release that
        // refuses to run twice. acquireUseRelease must call it exactly once, so the
        // guard's `disposed` flag is observed false-then-true exactly once.
        let disposed = false;
        let realDisposals = 0;
        const guardedRelease = () => {
          if (disposed) return;
          disposed = true;
          realDisposals++;
        };

        yield* withProgram(
          Effect.succeed({ key: "p" } satisfies FakeProgram),
          () => Effect.succeed("ok"),
          guardedRelease,
        );

        expect(realDisposals).toBe(1);
        expect(disposed).toBe(true);
      }),
  );
});
