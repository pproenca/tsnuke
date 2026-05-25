/**
 * Characterization tests for the tagged discovery error classes — RULE-037.
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * RULE-037: a discovery failure is a typed, discriminated error carrying a
 * `_tag` ∈ {TsDoctorError, ProjectNotFoundError, NoTypeScriptProjectError,
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
 *   4. `isTsDoctorError` is true for all five tags, false otherwise;
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
  TS_DOCTOR_ERROR_TAGS,
  TsconfigNotFoundError,
  TsDoctorError,
  isTsDoctorError,
} from "../main/index.js";

/**
 * Every concrete error class paired with its expected tag/name string. Each row
 * is one `[tag, factory]` so the contract is asserted uniformly across all five.
 */
const cases = [
  ["TsDoctorError", (m: string, o?: { cause?: unknown }) => new TsDoctorError(m, o)],
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

  it("TS_DOCTOR_ERROR_TAGS stays in lockstep with the exported classes (drift guard)", () => {
    // The `_tag`-membership guard replaced the legacy shared-base `instanceof` (D2), so the
    // set and the exported classes are two sources of truth. Adding a 6th error (a new
    // `cases` row) without updating the set — or leaving a stale tag in it — fails HERE,
    // so `isTsDoctorError` can't silently drift from `AnyTsDoctorError` (architecture review).
    expect(TS_DOCTOR_ERROR_TAGS.size).toBe(cases.length);
    for (const [tag] of cases) {
      expect(TS_DOCTOR_ERROR_TAGS.has(tag)).toBe(true);
    }
  });

  it("TS_DOCTOR_ERROR_TAGS lists exactly the five legacy tags", () => {
    // Frozen tag set is what the structural guard discriminates on (RULE-037).
    expect([...TS_DOCTOR_ERROR_TAGS].sort()).toStrictEqual(
      [
        "AmbiguousProjectError",
        "NoTypeScriptProjectError",
        "ProjectNotFoundError",
        "TsconfigNotFoundError",
        "TsDoctorError",
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

describe("RULE-037 — isTsDoctorError discriminates all five tags (serializeError dependency #4)", () => {
  it.each(cases)("isTsDoctorError(%s) === true", (_tag, make) => {
    expect(isTsDoctorError(make("boom"))).toBe(true);
  });

  it("isTsDoctorError narrows the type to TsDoctorError union", () => {
    const value: unknown = new AmbiguousProjectError("two matched");
    if (isTsDoctorError(value)) {
      // type-level: `value._tag` must be accessible after the guard.
      expect(value._tag).toBe("AmbiguousProjectError");
    } else {
      throw new Error("guard should have matched");
    }
  });

  it("isTsDoctorError(false) for non-errors and foreign errors", () => {
    expect(isTsDoctorError(undefined)).toBe(false);
    expect(isTsDoctorError(null)).toBe(false);
    expect(isTsDoctorError(42)).toBe(false);
    expect(isTsDoctorError("ProjectNotFoundError")).toBe(false);
    expect(isTsDoctorError(new Error("plain"))).toBe(false);
    expect(isTsDoctorError({ _tag: "ProjectNotFoundError" })).toBe(false);
    expect(isTsDoctorError({})).toBe(false);
    // a foreign tagged error with an unknown _tag must NOT match
    expect(isTsDoctorError(new Error("x") as unknown)).toBe(false);
  });
});
