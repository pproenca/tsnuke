/**
 * THE EQUIVALENCE PROOF — modern (effect/Data) vs a vendored frozen copy of the
 * legacy plain-Error classes, asserting the OBSERVABLE contract of RULE-037.
 *
 * Goal: prove that for every consumer-visible property `build-report.serializeError`
 * (and the CLI) depends on, the modern `Data.TaggedError` rewrite behaves
 * identically to the legacy `Error`-subclass implementation:
 *
 *   - `_tag` string         (identical)
 *   - `name` string         (identical)
 *   - `message`             (identical)
 *   - `instanceof Error`    (identical — true for both)
 *   - native `.cause`       (identical — same value, instanceof Error walkable)
 *   - `isTsNukeError`     (identical discrimination: all 5 true, others false)
 *
 * WHERE THE REPRESENTATIONS LEGITIMATELY DIFFER (asserted, not papered over):
 *
 *   1. Class identity / shared base. Legacy had ONE base class `TsNukeError`
 *      and every subclass was `instanceof TsNukeError`. The modern slice uses
 *      five INDEPENDENT `Data.TaggedError`s (no shared instance base) so that each
 *      keeps its own correct `name` (subclassing one tagged base would freeze
 *      `name` to the base tag). Cross-implementation `instanceof` is therefore
 *      NOT expected and is NOT asserted; the guard is contract-based (`_tag`
 *      membership) instead, which we prove discriminates identically.
 *   2. Extra Effect internals. Modern instances carry Effect machinery (a
 *      `Symbol(@effect/data/Equal)`-based structural equality, `[NodeInspect]`,
 *      etc.). These are additive and invisible to `serializeError`, so we assert
 *      only the contract, not deep structural equality of the instances.
 *
 * This file is the differential counterpart of `errors.test.ts` (which pins the
 * modern contract directly). Together they are the proof of behavioral equivalence.
 */

import { describe, expect, it } from "vitest";
import {
  AmbiguousProjectError,
  NoTypeScriptProjectError,
  ProjectNotFoundError,
  TsconfigNotFoundError,
  TsNukeError,
  isTsNukeError,
} from "../main/index.js";

// ===========================================================================
// ORACLE: Frozen, verbatim copy of
//   legacy/tsnuke/packages/core/src/errors.ts:10-61
// (plain Error subclasses, `_tag` discriminant, instanceof-based guard).
// For differential testing ONLY — do not "fix", refactor, or import from it.
// ===========================================================================
class LegacyTsNukeError extends Error {
  readonly _tag: string = "TsNukeError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = "TsNukeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class LegacyProjectNotFoundError extends LegacyTsNukeError {
  override readonly _tag = "ProjectNotFoundError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProjectNotFoundError";
  }
}
class LegacyNoTypeScriptProjectError extends LegacyTsNukeError {
  override readonly _tag = "NoTypeScriptProjectError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NoTypeScriptProjectError";
  }
}
class LegacyTsconfigNotFoundError extends LegacyTsNukeError {
  override readonly _tag = "TsconfigNotFoundError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TsconfigNotFoundError";
  }
}
class LegacyAmbiguousProjectError extends LegacyTsNukeError {
  override readonly _tag = "AmbiguousProjectError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AmbiguousProjectError";
  }
}
function legacyIsTsNukeError(value: unknown): value is LegacyTsNukeError {
  return value instanceof LegacyTsNukeError;
}

// ---------------------------------------------------------------------------
// Paired factories: same tag, legacy oracle vs modern impl. Construction shape
// (message, { cause }) is identical across both — itself part of the contract.
// ---------------------------------------------------------------------------
type Make = (m: string, o?: { cause?: unknown }) => Error & { readonly _tag: string };

const pairs: ReadonlyArray<readonly [string, Make, Make]> = [
  [
    "TsNukeError",
    (m, o) => new LegacyTsNukeError(m, o),
    (m, o) => new TsNukeError(m, o),
  ],
  [
    "ProjectNotFoundError",
    (m, o) => new LegacyProjectNotFoundError(m, o),
    (m, o) => new ProjectNotFoundError(m, o),
  ],
  [
    "NoTypeScriptProjectError",
    (m, o) => new LegacyNoTypeScriptProjectError(m, o),
    (m, o) => new NoTypeScriptProjectError(m, o),
  ],
  [
    "TsconfigNotFoundError",
    (m, o) => new LegacyTsconfigNotFoundError(m, o),
    (m, o) => new TsconfigNotFoundError(m, o),
  ],
  [
    "AmbiguousProjectError",
    (m, o) => new LegacyAmbiguousProjectError(m, o),
    (m, o) => new AmbiguousProjectError(m, o),
  ],
];

describe("equivalence — RULE-037 observable contract matches the legacy oracle", () => {
  it.each(pairs)(
    "%s: _tag, name, message, instanceof Error all identical to legacy",
    (_label, makeLegacy, makeModern) => {
      const legacy = makeLegacy("discovery failed");
      const modern = makeModern("discovery failed");

      expect(modern._tag).toBe(legacy._tag);
      expect(modern.name).toBe(legacy.name);
      expect(modern.message).toBe(legacy.message);
      expect(modern instanceof Error).toBe(legacy instanceof Error);
      expect(modern instanceof Error).toBe(true);
    },
  );

  it.each(pairs)(
    "%s: native .cause is set identically (serializeError walk parity)",
    (_label, makeLegacy, makeModern) => {
      const root = new Error("root boom");
      const legacy = makeLegacy("wrapper", { cause: root });
      const modern = makeModern("wrapper", { cause: root });

      const legacyCause = (legacy as { cause?: unknown }).cause;
      const modernCause = (modern as { cause?: unknown }).cause;

      expect(modernCause).toBe(root);
      expect(modernCause).toBe(legacyCause);
      expect(modernCause instanceof Error).toBe(true);
      expect(modernCause instanceof Error).toBe(legacyCause instanceof Error);
    },
  );

  it("the full serializeError .cause flatten produces an identical chain", () => {
    const root = new Error("disk gone");

    const legacyTop = new LegacyProjectNotFoundError("no project", {
      cause: new LegacyTsconfigNotFoundError("no tsconfig", { cause: root }),
    });
    const modernTop = new ProjectNotFoundError("no project", {
      cause: new TsconfigNotFoundError("no tsconfig", { cause: root }),
    });

    const flatten = (err: unknown): { message: string; name: string; chain: string[] } => {
      // verbatim port of legacy build-report.ts:50-61
      if (err instanceof Error) {
        const chain: string[] = [];
        let cause: unknown = (err as { cause?: unknown }).cause;
        while (cause instanceof Error) {
          chain.push(cause.message);
          cause = (cause as { cause?: unknown }).cause;
        }
        return { message: err.message, name: err.name, chain };
      }
      return { message: String(err), name: "UnknownError", chain: [] };
    };

    expect(flatten(modernTop)).toStrictEqual(flatten(legacyTop));
    expect(flatten(modernTop)).toStrictEqual({
      message: "no project",
      name: "ProjectNotFoundError",
      chain: ["no tsconfig", "disk gone"],
    });
  });
});

describe("equivalence — RULE-037 guard discriminates identically to legacy", () => {
  it.each(pairs)(
    "%s: both guards return true for their own family",
    (_label, makeLegacy, makeModern) => {
      expect(isTsNukeError(makeModern("x"))).toBe(true);
      expect(legacyIsTsNukeError(makeLegacy("x"))).toBe(true);
    },
  );

  it("both guards return false for the same non-error / foreign inputs", () => {
    const negatives: unknown[] = [
      undefined,
      null,
      42,
      "ProjectNotFoundError",
      new Error("plain"),
      { _tag: "ProjectNotFoundError" },
      {},
      [],
    ];
    for (const v of negatives) {
      expect(isTsNukeError(v)).toBe(legacyIsTsNukeError(v));
      expect(isTsNukeError(v)).toBe(false);
    }
  });

  it("DOCUMENTED DIVERGENCE: cross-impl instanceof of the legacy base is NOT preserved", () => {
    // Legacy used a single shared base; modern uses five independent tagged
    // errors (see file header, divergence #1). A modern instance is therefore
    // NOT `instanceof` the legacy base class — which is exactly why the modern
    // guard is contract-based (`_tag` membership), not instanceof-based. We
    // assert the divergence explicitly so it is a known, intentional fact.
    const modern = new ProjectNotFoundError("x");
    expect(modern instanceof LegacyTsNukeError).toBe(false);
    // ...yet the contract guard still classifies it correctly:
    expect(isTsNukeError(modern)).toBe(true);
    // ...and it remains a real Error (the contract that actually matters):
    expect(modern instanceof Error).toBe(true);
  });
});
