/**
 * Characterization tests for `validateGlobPattern` — RULE-014 (glob ReDoS caps).
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * RULE-014 (BC-17): reject a glob pattern BEFORE RegExp compilation if it is
 * pathologically long or wildcard-heavy. The caps are FROZEN verbatim from
 * react-doctor and are NOT user-configurable:
 *   - length  > 1024  (MAX_GLOB_PATTERN_LENGTH)  -> reject
 *   - count of `*`/`?` > 24 (MAX_GLOB_PATTERN_WILDCARDS) -> reject
 * Both caps are EXCLUSIVE (at the cap is allowed; one over is rejected). Only
 * `*` and `?` count as wildcards — bracket/brace classes do NOT.
 *
 * DEVIATION (idiomatic, see TRANSFORMATION_NOTES D1): `InvalidGlobPatternError`
 * is an `effect/Data` tagged error rather than a hand-rolled `class extends Error`.
 * Its observable surface is preserved: `_tag === "InvalidGlobPatternError"`,
 * `name === "InvalidGlobPatternError"`, a message, and `instanceof Error`.
 */

import { describe, expect, it } from "vitest";
import {
  InvalidGlobPatternError,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  validateGlobPattern,
} from "../main/index.js";

describe("validateGlobPattern — RULE-014 (frozen caps)", () => {
  // RULE-014/RULE-041: the caps are FROZEN in code, never config.
  it("freezes MAX_GLOB_PATTERN_LENGTH = 1024", () => {
    expect(MAX_GLOB_PATTERN_LENGTH).toBe(1024);
  });
  it("freezes MAX_GLOB_PATTERN_WILDCARDS = 24", () => {
    expect(MAX_GLOB_PATTERN_WILDCARDS).toBe(24);
  });
});

describe("validateGlobPattern — RULE-014 (accepts patterns at/under the caps)", () => {
  it("accepts a reasonable glob", () => {
    expect(() => validateGlobPattern("src/**/*.ts")).not.toThrow();
  });

  it("accepts the empty string (0 length, 0 wildcards)", () => {
    expect(() => validateGlobPattern("")).not.toThrow();
  });

  it("accepts a pattern with exactly 24 wildcards (at the cap, allowed)", () => {
    const pattern = "*".repeat(MAX_GLOB_PATTERN_WILDCARDS); // 24
    expect(() => validateGlobPattern(pattern)).not.toThrow();
  });

  it("accepts a pattern of exactly 1024 chars (at the cap, allowed)", () => {
    // 1024 'a' chars: at the length cap, zero wildcards.
    const pattern = "a".repeat(MAX_GLOB_PATTERN_LENGTH); // 1024
    expect(() => validateGlobPattern(pattern)).not.toThrow();
  });

  it("counts only `*` and `?` — bracket/brace classes do NOT count", () => {
    // 24 '*' (at cap) + many brackets/braces/letters: still valid since only
    // the 24 stars are wildcards and the total length is under 1024.
    const pattern = "*".repeat(24) + "[abc]{x,y}".repeat(10);
    expect(pattern.length).toBeLessThanOrEqual(MAX_GLOB_PATTERN_LENGTH);
    expect(() => validateGlobPattern(pattern)).not.toThrow();
  });

  it("counts `?` as a wildcard (24 question marks is at the cap, allowed)", () => {
    expect(() => validateGlobPattern("?".repeat(24))).not.toThrow();
  });
});

describe("validateGlobPattern — RULE-014 (rejects over the caps)", () => {
  it("rejects 25 wildcards (one over the cap) with InvalidGlobPatternError", () => {
    const pattern = "*".repeat(MAX_GLOB_PATTERN_WILDCARDS + 1); // 25
    expect(() => validateGlobPattern(pattern)).toThrow(InvalidGlobPatternError);
  });

  it("rejects a mix of `*` and `?` totalling 25 wildcards", () => {
    const pattern = "*".repeat(13) + "?".repeat(12); // 25
    expect(() => validateGlobPattern(pattern)).toThrow(InvalidGlobPatternError);
  });

  it("rejects a pattern of 1025 chars (one over the length cap)", () => {
    expect(() => validateGlobPattern("a".repeat(MAX_GLOB_PATTERN_LENGTH + 1))).toThrow(
      InvalidGlobPatternError,
    );
  });

  it("the length cap is checked first: a 1025-char all-'a' pattern (0 wildcards) still throws", () => {
    // No wildcards at all, so only the length branch can reject it.
    expect(() => validateGlobPattern("a".repeat(1025))).toThrow(InvalidGlobPatternError);
  });
});

describe("validateGlobPattern — RULE-014 (error surface preserved)", () => {
  it("the thrown error has _tag, name, message and is an Error instance", () => {
    let caught: unknown;
    try {
      validateGlobPattern("*".repeat(25));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidGlobPatternError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as InvalidGlobPatternError;
    expect(err._tag).toBe("InvalidGlobPatternError");
    expect(err.name).toBe("InvalidGlobPatternError");
    expect(typeof err.message).toBe("string");
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("the wildcard-cap message reports the offending count and the cap", () => {
    let msg = "";
    try {
      validateGlobPattern("*".repeat(25));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("25");
    expect(msg).toContain(String(MAX_GLOB_PATTERN_WILDCARDS));
  });

  it("the length-cap message reports the offending length and the cap", () => {
    let msg = "";
    try {
      validateGlobPattern("a".repeat(1025));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("1025");
    expect(msg).toContain(String(MAX_GLOB_PATTERN_LENGTH));
  });
});
