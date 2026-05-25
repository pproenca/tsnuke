/**
 * Characterization tests for `summarizeMonorepoScore` — RULE-003.
 *
 * RULE-003: a monorepo's single headline score is the worst package's score —
 * the MINIMUM over present per-project scores. Absent projects are skipped.
 * If nothing is scored, the summary is absent.
 *
 * MODERNIZATION: legacy modeled absence with `number | null`. The Effect rewrite
 * uses `Option<Score>` idiomatically:
 *   - present score -> `Option.some(makeScore(n))`
 *   - unscored      -> `Option.none()`
 *   - result        -> `Option<Score>` (absent when no project is scored).
 */

import { Equal, Option } from "effect";
import { describe, expect, it } from "vitest";
import { makeScore, summarizeMonorepoScore } from "../main/index.js";

describe("summarizeMonorepoScore — RULE-003 (MIN over present scores)", () => {
  it("returns the MIN over present scores", () => {
    const result = summarizeMonorepoScore([
      Option.some(makeScore(90)),
      Option.some(makeScore(40)),
      Option.some(makeScore(70)),
    ]);
    expect(Option.getOrNull(result)).toBe(40);
  });

  it("a single 0-score package drags the whole monorepo to 0 (BC-05, intentional)", () => {
    const result = summarizeMonorepoScore([
      Option.some(makeScore(100)),
      Option.some(makeScore(0)),
      Option.some(makeScore(55)),
    ]);
    expect(Option.getOrNull(result)).toBe(0);
  });

  it("a single present score is returned as-is", () => {
    const result = summarizeMonorepoScore([Option.some(makeScore(82))]);
    expect(Option.getOrNull(result)).toBe(82);
  });
});

describe("summarizeMonorepoScore — RULE-003 (absent entries skipped)", () => {
  it("skips Option.none entries and minimizes over the rest", () => {
    const result = summarizeMonorepoScore([
      Option.some(makeScore(90)),
      Option.none(),
      Option.some(makeScore(55)),
    ]);
    expect(Option.getOrNull(result)).toBe(55);
  });

  it("a leading absent entry does not become a phantom 0", () => {
    const result = summarizeMonorepoScore([
      Option.none(),
      Option.some(makeScore(63)),
    ]);
    expect(Option.getOrNull(result)).toBe(63);
  });
});

describe("summarizeMonorepoScore — RULE-003 (nothing scored -> absent)", () => {
  it("all-none -> Option.none", () => {
    const result = summarizeMonorepoScore([Option.none(), Option.none()]);
    expect(Option.isNone(result)).toBe(true);
    expect(Option.getOrNull(result)).toBeNull();
  });

  it("empty list -> Option.none", () => {
    const result = summarizeMonorepoScore([]);
    expect(Option.isNone(result)).toBe(true);
    expect(Option.getOrNull(result)).toBeNull();
  });
});

describe("summarizeMonorepoScore — RULE-003 (Option identity via Equal)", () => {
  it("result equals Option.some(min) under Effect's structural equivalence", () => {
    const result = summarizeMonorepoScore([
      Option.some(makeScore(70)),
      Option.some(makeScore(70)),
    ]);
    expect(Equal.equals(result, Option.some(makeScore(70)))).toBe(true);
  });
});
