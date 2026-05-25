/**
 * Characterization tests for the tagged discovery error classes — RULE-037.
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * RULE-037: a discovery failure is a typed, discriminated error carrying a
 * `_tag` ∈ {TsFixError, ProjectNotFoundError, NoTypeScriptProjectError,
 * TsconfigNotFoundError, AmbiguousProjectError}. It propagates to the CLI (exit 1)
 * or to `serializeError` (`report.ok = false`), which flattens the `.cause` chain.
 *
 * The legacy module (READ-ONLY oracle) used plain `Error` subclasses with a `_tag`
 * discriminant and an `instanceof`-based guard. The modern module moves BACK to
 * idiomatic `effect/Data` tagged errors (`Data.TaggedError`). The OBSERVABLE
 * contract that downstream `build-report.serializeError` depends on MUST be
 * preserved, and is pinned here:
 *   1. each error is `instanceof Error`;
 *   2. `_tag` AND `name` equal the legacy strings ("ProjectNotFoundError" etc.);
 *   3. `cause` lands on the NATIVE `.cause` property and is retrievable;
 *   4. `isTsFixError` is true for all five tags, false otherwise;
 *   5. each carries a `message`.
 *
 * The differential proof against a vendored frozen copy of the legacy classes
 * lives in `equivalence.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  AmbiguousProjectError,
  NoTypeScriptProjectError,
  ProjectNotFoundError,
  TS_FIX_ERROR_TAGS,
  TsconfigNotFoundError,
  TsFixError,
  isTsFixError,
} from "../main/index.js";

/**
 * Every concrete error class paired with its expected tag/name string. Each row
 * is one `[tag, factory]` so the contract is asserted uniformly across all five.
 */
const cases = [
  ["TsFixError", (m: string, o?: { cause?: unknown }) => new TsFixError(m, o)],
  ["ProjectNotFoundError", (m: string, o?: { cause?: unknown }) => new ProjectNotFoundError(m, o)],
  ["NoTypeScriptProjectError", (m: string, o?: { cause?: unknown }) => new NoTypeScriptProjectError(m, o)],
  ["TsconfigNotFoundError", (m: string, o?: { cause?: unknown }) => new TsconfigNotFoundError(m, o)],
  ["AmbiguousProjectError", (m: string, o?: { cause?: unknown }) => new AmbiguousProjectError(m, o)],
] as const;

describe("RULE-037 — five discriminant tags exist with exact tag/name values", () => {
  it.each(cases)("%s carries _tag === name === the legacy string", (tag, make) => {
    const e = make("boom");
    expect(e._tag).toBe(tag);
    expect(e.name).toBe(tag);
  });

  it("TS_FIX_ERROR_TAGS stays in lockstep with the exported classes (drift guard)", () => {
    // The `_tag`-membership guard replaced the legacy shared-base `instanceof` (D2), so the
    // set and the exported classes are two sources of truth. Adding a 6th error (a new
    // `cases` row) without updating the set — or leaving a stale tag in it — fails HERE,
    // so `isTsFixError` can't silently drift from `AnyTsFixError` (architecture review).
    expect(TS_FIX_ERROR_TAGS.size).toBe(cases.length);
    for (const [tag] of cases) {
      expect(TS_FIX_ERROR_TAGS.has(tag)).toBe(true);
    }
  });

  it("TS_FIX_ERROR_TAGS lists exactly the five legacy tags", () => {
    // Frozen tag set is what the structural guard discriminates on (RULE-037).
    expect([...TS_FIX_ERROR_TAGS].sort()).toStrictEqual(
      [
        "AmbiguousProjectError",
        "NoTypeScriptProjectError",
        "ProjectNotFoundError",
        "TsconfigNotFoundError",
        "TsFixError",
      ].sort(),
    );
  });
});

describe("RULE-037 — every error is instanceof Error (serializeError dependency #1)", () => {
  it.each(cases)("%s instanceof Error", (_tag, make) => {
    expect(make("boom")).toBeInstanceOf(Error);
  });
});

describe("RULE-037 — each carries a message (serializeError dependency #5)", () => {
  it.each(cases)("%s exposes the constructor message", (_tag, make) => {
    expect(make("something went wrong").message).toBe("something went wrong");
  });
});

describe("RULE-037 — cause lands on the NATIVE .cause property (serializeError dependency #3)", () => {
  it.each(cases)("%s sets a retrievable native .cause", (_tag, make) => {
    const root = new Error("root boom");
    const e = make("wrapper", { cause: root });
    // `serializeError` reads `(err as { cause?: unknown }).cause` and tests
    // `cause instanceof Error` — so the cause must be the native property.
    const native = (e as { cause?: unknown }).cause;
    expect(native).toBe(root);
    expect(native).toBeInstanceOf(Error);
  });

  it.each(cases)("%s with no cause has undefined native .cause", (_tag, make) => {
    const e = make("no cause");
    expect((e as { cause?: unknown }).cause).toBeUndefined();
  });

  it("serializeError-style .cause walk flattens a chain root-last", () => {
    // Reproduces the exact loop in legacy build-report.ts:50-61.
    const root = new Error("disk gone");
    const mid = new TsconfigNotFoundError("no tsconfig", { cause: root });
    const top = new ProjectNotFoundError("no project", { cause: mid });

    const chain: string[] = [];
    let cause: unknown = (top as { cause?: unknown }).cause;
    while (cause instanceof Error) {
      chain.push(cause.message);
      cause = (cause as { cause?: unknown }).cause;
    }
    expect(top.message).toBe("no project");
    expect(top.name).toBe("ProjectNotFoundError");
    expect(chain).toStrictEqual(["no tsconfig", "disk gone"]);
  });
});

describe("RULE-037 — isTsFixError discriminates all five tags (serializeError dependency #4)", () => {
  it.each(cases)("isTsFixError(%s) === true", (_tag, make) => {
    expect(isTsFixError(make("boom"))).toBe(true);
  });

  it("isTsFixError narrows the type to TsFixError union", () => {
    const value: unknown = new AmbiguousProjectError("two matched");
    if (isTsFixError(value)) {
      // type-level: `value._tag` must be accessible after the guard.
      expect(value._tag).toBe("AmbiguousProjectError");
    } else {
      throw new Error("guard should have matched");
    }
  });

  it("isTsFixError(false) for non-errors and foreign errors", () => {
    expect(isTsFixError(undefined)).toBe(false);
    expect(isTsFixError(null)).toBe(false);
    expect(isTsFixError(42)).toBe(false);
    expect(isTsFixError("ProjectNotFoundError")).toBe(false);
    expect(isTsFixError(new Error("plain"))).toBe(false);
    expect(isTsFixError({ _tag: "ProjectNotFoundError" })).toBe(false);
    expect(isTsFixError({})).toBe(false);
    // a foreign tagged error with an unknown _tag must NOT match
    expect(isTsFixError(new Error("x") as unknown)).toBe(false);
  });
});
