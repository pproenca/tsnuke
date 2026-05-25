/**
 * THE EQUIVALENCE PROOF — differential tests, modern vs legacy oracle.
 *
 * Two parts, two oracles:
 *
 *  - PART A (RULE-013): the PURE memory guard is byte-for-byte equivalent to the
 *    legacy `shouldSkipTier2ForMemory` with ZERO divergence. (Unlike the `score`
 *    slice, there is NO deliberate behavioral deviation here — the formula is
 *    carried over verbatim.) Enumerated exhaustively over a boundary-rich grid.
 *
 *  - PART B (RULE-036): the modern `withProgram` reproduces the legacy
 *    `withDisposableProgram(key, build, dispose, fn)` try/finally contract on the
 *    two cases legacy can express — SUCCESS and THROW (dispose runs after fn, even
 *    when fn throws). INTERRUPTION is a strict Effect superset legacy cannot
 *    express; it is asserted MODERN-ONLY in `scopedProgram.test.ts`, not here.
 *
 * Strategy: vendor frozen copies of the legacy functions as oracles (below) and
 * assert the modern implementations agree on every legacy-expressible behavior.
 */

import { it as effectIt } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  shouldSkipTier2ForMemory,
  withProgram,
} from "../main/index.js";

// ===========================================================================
// PART A — RULE-013 memory guard equivalence
// ===========================================================================

// ---------------------------------------------------------------------------
// ORACLE: Frozen copy of legacy/ts-doctor/packages/core/src/scale.ts:110-125.
// For differential testing ONLY — do not "fix" it.
// ---------------------------------------------------------------------------
const LEGACY_DEFAULT_TIER2_MEMORY_CEILING_BYTES = 2_000_000_000;

function legacyShouldSkipTier2ForMemory(
  currentRssBytes: number,
  estimatedProgramBytes: number,
  ceilingBytes: number = LEGACY_DEFAULT_TIER2_MEMORY_CEILING_BYTES,
): boolean {
  return currentRssBytes + estimatedProgramBytes > ceilingBytes;
}

describe("equivalence — RULE-013: modern constant matches the frozen oracle", () => {
  it("DEFAULT_TIER2_MEMORY_CEILING_BYTES matches legacy", () => {
    expect(DEFAULT_TIER2_MEMORY_CEILING_BYTES).toBe(
      LEGACY_DEFAULT_TIER2_MEMORY_CEILING_BYTES,
    );
  });
});

describe("equivalence — RULE-013: exhaustive boundary grid, ZERO divergence", () => {
  it("modern === legacy for every (rss, est, ceiling) over a boundary-rich grid", () => {
    // A small ceiling so we can walk rss/est densely AROUND it — every case lands
    // strictly below, exactly on, or strictly above the boundary (the only thing
    // that can distinguish a `>` from a `>=` bug).
    const ceilings = [0, 1, 50, 100, 1_000];
    let comparedTriples = 0;
    let skipTrueCount = 0; // harness guard: the skip branch must actually fire

    for (const ceiling of ceilings) {
      for (let rss = 0; rss <= 120; rss++) {
        for (let est = 0; est <= 120; est++) {
          const modern = shouldSkipTier2ForMemory(rss, est, ceiling);
          const legacy = legacyShouldSkipTier2ForMemory(rss, est, ceiling);
          expect(
            modern,
            `divergence at rss=${rss} est=${est} ceiling=${ceiling}`,
          ).toBe(legacy);
          if (modern) skipTrueCount++;
          comparedTriples++;
        }
      }
    }

    // Also pin the default-ceiling overload (omitted arg) against the oracle's.
    for (const [rss, est] of [
      [0, 0],
      [1_999_999_999, 1],
      [2_000_000_000, 0],
      [2_000_000_000, 1],
      [1_500_000_000, 600_000_000],
    ] as const) {
      expect(shouldSkipTier2ForMemory(rss, est)).toBe(
        legacyShouldSkipTier2ForMemory(rss, est),
      );
      comparedTriples++;
    }

    expect(comparedTriples).toBe(ceilings.length * 121 * 121 + 5);
    expect(skipTrueCount).toBeGreaterThan(0); // the skip branch was exercised
  });
});

// ===========================================================================
// PART B — RULE-036 disposal equivalence (legacy-expressible cases only)
// ===========================================================================

// ---------------------------------------------------------------------------
// ORACLE: Frozen copy of legacy/ts-doctor/packages/core/src/scale.ts:58-103
// (withDisposable + withDisposableProgram, the hand-rolled using/try-finally).
// For differential testing ONLY.
// ---------------------------------------------------------------------------
const LEGACY_DISPOSE: symbol =
  (Symbol as { dispose?: symbol }).dispose ?? Symbol.for("Symbol.dispose");

interface LegacyDisposableResource<T> {
  readonly value: T;
  dispose(): void;
}

function legacyWithDisposable<T>(
  value: T,
  dispose: (value: T) => void,
): LegacyDisposableResource<T> {
  let disposed = false;
  const doDispose = (): void => {
    if (disposed) return;
    disposed = true;
    dispose(value);
  };
  const resource: LegacyDisposableResource<T> = { value, dispose: doDispose };
  Object.defineProperty(resource, LEGACY_DISPOSE, {
    value: doDispose,
    enumerable: false,
  });
  return resource;
}

function legacyWithDisposableProgram<TProgram, TResult>(
  key: string,
  build: (key: string) => TProgram,
  dispose: (program: TProgram) => void,
  fn: (program: TProgram) => TResult,
): TResult {
  const held = legacyWithDisposable(build(key), dispose);
  try {
    return fn(held.value);
  } finally {
    held.dispose();
  }
}

// A trivial stand-in for a `ts.Program`: a tagged record so we can assert the SAME
// object built is the one used and disposed.
interface FakeProgram {
  readonly key: string;
}

describe("equivalence — RULE-036: withProgram mirrors legacy withDisposableProgram (SUCCESS)", () => {
  it("legacy: dispose runs after fn on success; result returned; order preserved", () => {
    const events: string[] = [];
    const result = legacyWithDisposableProgram(
      "proj-a",
      (key) => {
        events.push(`build:${key}`);
        return { key } satisfies FakeProgram;
      },
      (p) => events.push(`dispose:${p.key}`),
      (p) => {
        events.push(`use:${p.key}`);
        return p.key.length;
      },
    );
    expect(result).toBe("proj-a".length);
    expect(events).toStrictEqual(["build:proj-a", "use:proj-a", "dispose:proj-a"]);
  });

  effectIt.effect(
    "modern: same observable sequence and result via Effect.acquireUseRelease",
    () =>
      Effect.gen(function* () {
        const events: string[] = [];
        const result = yield* withProgram(
          Effect.sync(() => {
            events.push("build:proj-a");
            return { key: "proj-a" } satisfies FakeProgram;
          }),
          (p) =>
            Effect.sync(() => {
              events.push(`use:${p.key}`);
              return p.key.length;
            }),
          (p) => {
            events.push(`dispose:${p.key}`);
          },
        );
        expect(result).toBe("proj-a".length);
        expect(events).toStrictEqual([
          "build:proj-a",
          "use:proj-a",
          "dispose:proj-a",
        ]);
      }),
  );
});

describe("equivalence — RULE-036: withProgram mirrors legacy withDisposableProgram (THROW)", () => {
  it("legacy: dispose still runs when fn throws; error propagates", () => {
    const events: string[] = [];
    const boom = new Error("use failed");
    expect(() =>
      legacyWithDisposableProgram(
        "proj-b",
        (key) => ({ key }) satisfies FakeProgram,
        (p) => events.push(`dispose:${p.key}`),
        () => {
          events.push("use:throws");
          throw boom;
        },
      ),
    ).toThrow(boom);
    // The `finally` ran the dispose AFTER the failing use.
    expect(events).toStrictEqual(["use:throws", "dispose:proj-b"]);
  });

  effectIt.effect(
    "modern: release still runs when use fails; error surfaces on the error channel",
    () =>
      Effect.gen(function* () {
        const events: string[] = [];
        const boom = "use failed" as const;
        const exit = yield* withProgram(
          Effect.succeed({ key: "proj-b" } satisfies FakeProgram),
          (_p) =>
            Effect.sync(() => {
              events.push("use:throws");
            }).pipe(Effect.flatMap(() => Effect.fail(boom))),
          (p) => {
            events.push(`dispose:${p.key}`);
          },
        ).pipe(Effect.exit);

        expect(exit).toStrictEqual(Exit.fail(boom));
        // Same observable sequence as legacy's finally: dispose AFTER the failing use.
        expect(events).toStrictEqual(["use:throws", "dispose:proj-b"]);
      }),
  );
});
