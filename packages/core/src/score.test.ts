import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/rules";
import {
  ERROR_RULE_PENALTY,
  PERFECT_SCORE,
  WARNING_RULE_PENALTY,
  computeScore,
  scoreLabel,
  summarizeMonorepoScore,
} from "./score.js";

/** Build a plain Diagnostic literal (structural typing — no runtime sibling import). */
function diag(over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity">): Diagnostic {
  return {
    filePath: "/x/a.ts",
    plugin: "ts-doctor",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

describe("computeScore (BC-01/02)", () => {
  it("empty diagnostics → 100 / Great", () => {
    const { score, label } = computeScore([]);
    expect(score).toBe(PERFECT_SCORE);
    expect(label).toBe("Great");
  });

  it("penalizes a distinct rule once even when it fires multiple times (BC-02)", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error", line: 1 }),
      diag({ rule: "no-any", severity: "error", line: 5 }),
      diag({ rule: "no-any", severity: "error", line: 9 }),
    ];
    // One distinct error rule → 100 - 1.5 = 98.5 → round → 99 (NOT 100-4.5).
    const { score } = computeScore(ds);
    expect(score).toBe(Math.round(PERFECT_SCORE - ERROR_RULE_PENALTY));
    expect(score).toBe(99);
  });

  it("applies frozen error (1.5) and warning (0.75) weights per distinct rule", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error" }),
      diag({ rule: "no-floating-promise", severity: "error" }),
      diag({ rule: "prefer-type-alias", severity: "warning" }),
    ];
    // 2 error rules × 1.5 + 1 warning rule × 0.75 = 3.75 → 100 - 3.75 = 96.25 → 96
    const expected = Math.round(
      PERFECT_SCORE - (2 * ERROR_RULE_PENALTY + 1 * WARNING_RULE_PENALTY),
    );
    expect(computeScore(ds).score).toBe(expected);
    expect(expected).toBe(96);
  });

  it("the same rule key counts once regardless of file (breadth-not-depth)", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error", filePath: "/x/a.ts" }),
      diag({ rule: "no-any", severity: "error", filePath: "/x/b.ts" }),
    ];
    expect(computeScore(ds).score).toBe(99);
  });

  it("floors at 0 for a large distinct-rule count", () => {
    const ds = Array.from({ length: 200 }, (_, i) =>
      diag({ rule: `rule-${i}`, severity: "error" }),
    );
    expect(computeScore(ds).score).toBe(0);
  });
});

describe("scoreLabel bands (BC-04)", () => {
  it("≥75 → Great (lower bound inclusive)", () => {
    expect(scoreLabel(100)).toBe("Great");
    expect(scoreLabel(75)).toBe("Great");
  });
  it("≥50 and <75 → Needs work", () => {
    expect(scoreLabel(74)).toBe("Needs work");
    expect(scoreLabel(50)).toBe("Needs work");
  });
  it("<50 → Critical", () => {
    expect(scoreLabel(49)).toBe("Critical");
    expect(scoreLabel(0)).toBe("Critical");
  });
});

describe("summarizeMonorepoScore (BC-05)", () => {
  it("returns the MIN over scored projects", () => {
    expect(summarizeMonorepoScore([90, 40, 70])).toBe(40);
  });
  it("skips null (unscored) entries", () => {
    expect(summarizeMonorepoScore([90, null, 55])).toBe(55);
  });
  it("returns null when nothing is scored", () => {
    expect(summarizeMonorepoScore([null, null])).toBeNull();
    expect(summarizeMonorepoScore([])).toBeNull();
  });
});
