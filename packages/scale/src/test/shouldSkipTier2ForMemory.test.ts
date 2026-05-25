/**
 * Characterization tests for `shouldSkipTier2ForMemory` — RULE-013 (Tier-2
 * memory-ceiling guard). PART A — the PURE half.
 *
 * These tests DEFINE "done" for the pure memory guard. RULE-013:
 *   skip Tier-2 (return true) ⇔ currentRssBytes + estimatedProgramBytes > ceiling.
 *
 * The comparison is STRICT (`>`): a sum EQUAL to the ceiling does NOT skip (the
 * ceiling is the last acceptable value). The boundary trio below (sum < / === / >)
 * pins that exactly.
 *
 * Plain `vitest` — no `@effect/vitest` here: this function is a pure synchronous
 * predicate, NOT an `Effect` (Brief: don't wrap the pure memory check). The
 * effectful resource half is tested with `it.effect` in `scopedProgram.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  shouldSkipTier2ForMemory,
} from "../main/index.js";

describe("shouldSkipTier2ForMemory — RULE-013 (default ceiling constant)", () => {
  it("DEFAULT_TIER2_MEMORY_CEILING_BYTES = 2_000_000_000 (~1.86 GiB)", () => {
    expect(DEFAULT_TIER2_MEMORY_CEILING_BYTES).toBe(2_000_000_000);
  });
});

describe("shouldSkipTier2ForMemory — RULE-013 (boundary: sum vs ceiling)", () => {
  const CEILING = 1_000;

  it("sum < ceiling -> false (proceed; 600 + 399 = 999 < 1000)", () => {
    expect(shouldSkipTier2ForMemory(600, 399, CEILING)).toBe(false);
  });

  it("sum === ceiling -> false (strict >, so equal does NOT skip; 600 + 400 = 1000)", () => {
    expect(shouldSkipTier2ForMemory(600, 400, CEILING)).toBe(false);
  });

  it("sum > ceiling -> true (skip Tier-2; 600 + 401 = 1001 > 1000)", () => {
    expect(shouldSkipTier2ForMemory(600, 401, CEILING)).toBe(true);
  });
});

describe("shouldSkipTier2ForMemory — RULE-013 (default ceiling applied when omitted)", () => {
  it("just below the default ceiling -> false", () => {
    // 1.5 GiB resident + 0.4 GiB program = 1.9e9 < 2.0e9 -> proceed
    expect(shouldSkipTier2ForMemory(1_500_000_000, 400_000_000)).toBe(false);
  });

  it("exactly the default ceiling -> false (strict)", () => {
    // 1.5e9 + 0.5e9 = 2.0e9 === default ceiling -> NOT skipped
    expect(shouldSkipTier2ForMemory(1_500_000_000, 500_000_000)).toBe(false);
  });

  it("just above the default ceiling -> true (skip)", () => {
    // 1.5e9 + 0.5e9 + 1 byte = 2.0e9 + 1 > ceiling -> skip
    expect(shouldSkipTier2ForMemory(1_500_000_000, 500_000_001)).toBe(true);
  });

  it("omitted ceiling uses exactly DEFAULT_TIER2_MEMORY_CEILING_BYTES", () => {
    // Equivalent to passing the constant explicitly.
    const a = shouldSkipTier2ForMemory(2_000_000_000, 1);
    const b = shouldSkipTier2ForMemory(
      2_000_000_000,
      1,
      DEFAULT_TIER2_MEMORY_CEILING_BYTES,
    );
    expect(a).toBe(b);
    expect(a).toBe(true); // 2e9 + 1 > 2e9
  });
});

describe("shouldSkipTier2ForMemory — RULE-013 (custom ceiling overrides default)", () => {
  it("a generous custom ceiling lets a large run proceed", () => {
    // Would skip under the default (2e9) but a 4 GiB host ceiling proceeds.
    expect(shouldSkipTier2ForMemory(2_000_000_000, 1_000_000_000)).toBe(true);
    expect(
      shouldSkipTier2ForMemory(2_000_000_000, 1_000_000_000, 4_000_000_000),
    ).toBe(false);
  });

  it("a tight custom ceiling skips a run the default would have allowed", () => {
    // 0.6 GiB + 0.4 GiB = 1.0 GiB: under default 2e9 -> proceed; under 0.5e9 -> skip.
    expect(shouldSkipTier2ForMemory(600_000_000, 400_000_000)).toBe(false);
    expect(
      shouldSkipTier2ForMemory(600_000_000, 400_000_000, 500_000_000),
    ).toBe(true);
  });
});

describe("shouldSkipTier2ForMemory — RULE-013 (degenerate / edge inputs)", () => {
  it("zero RSS and zero program never exceeds a positive ceiling", () => {
    expect(shouldSkipTier2ForMemory(0, 0, 1_000)).toBe(false);
  });

  it("a single estimated byte over a zero ceiling skips (pure additive, no clamping)", () => {
    expect(shouldSkipTier2ForMemory(0, 1, 0)).toBe(true);
  });

  it("zero ceiling with zero usage does NOT skip (0 > 0 is false)", () => {
    expect(shouldSkipTier2ForMemory(0, 0, 0)).toBe(false);
  });
});
