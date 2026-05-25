/**
 * Characterization tests for Stage 2 — severity override (RULE-023 Stage 2, RULE-040).
 *
 * RULE-023 Stage 2 / RULE-040:
 *  - config `rules` (per-rule) take PRECEDENCE over `categories` (per-category).
 *  - `"off"` drops the diagnostic; `"warn"` normalizes to canonical `"warning"`;
 *    `"error"` to canonical `"error"`.
 *  - rule-id matching accepts BOTH bare `rule` and namespaced `plugin/rule`.
 *
 * D1 (structural, no output change): the `warn`→`warning` normalization lives in a
 * SINGLE function `normalizeConfigSeverity` (legacy did it in two places). Tested
 * directly here, and through the stage.
 */

import { describe, expect, it } from "vitest";
import { makeSeverityStage, normalizeConfigSeverity } from "../main/index.js";
import { diag } from "./helpers.js";

describe("normalizeConfigSeverity — RULE-040 (single canonical vocabulary, D1)", () => {
  it("'error' -> canonical 'error'", () => {
    expect(normalizeConfigSeverity("error")).toBe("error");
  });
  it("'warn' -> canonical 'warning'", () => {
    expect(normalizeConfigSeverity("warn")).toBe("warning");
  });
  it("'off' -> 'off' sentinel (drop)", () => {
    expect(normalizeConfigSeverity("off")).toBe("off");
  });
});

describe("makeSeverityStage — RULE-023 Stage 2 (rules: off drops)", () => {
  it("config.rules 'off' drops the diagnostic (bare rule id)", () => {
    const stage = makeSeverityStage({ rules: { "off-me": "off" } });
    expect(stage(diag({ rule: "off-me" }))).toBeNull();
  });

  it("config.rules 'off' drops via namespaced plugin/rule id", () => {
    const stage = makeSeverityStage({ rules: { "ts-fix/off-me": "off" } });
    expect(stage(diag({ plugin: "ts-fix", rule: "off-me" }))).toBeNull();
  });
});

describe("makeSeverityStage — RULE-023 Stage 2 (rules: remap, RULE-040 vocab)", () => {
  it("config.rules 'warn' remaps severity to canonical 'warning'", () => {
    const stage = makeSeverityStage({ rules: { downgraded: "warn" } });
    const out = stage(diag({ rule: "downgraded", severity: "error" }));
    expect(out?.severity).toBe("warning");
  });

  it("config.rules 'error' remaps a warning up to 'error'", () => {
    const stage = makeSeverityStage({ rules: { upgraded: "error" } });
    const out = stage(diag({ rule: "upgraded", severity: "warning" }));
    expect(out?.severity).toBe("error");
  });

  it("remap preserves all other fields (only severity changes)", () => {
    const stage = makeSeverityStage({ rules: { r: "warn" } });
    const input = diag({ rule: "r", severity: "error", filePath: "/x/z.ts", line: 7 });
    const out = stage(input);
    expect(out).toEqual({ ...input, severity: "warning" });
  });

  it("no override for the rule -> returns the diagnostic unchanged (same ref)", () => {
    const stage = makeSeverityStage({ rules: { other: "off" } });
    const input = diag({ rule: "untouched" });
    expect(stage(input)).toBe(input);
  });
});

describe("makeSeverityStage — RULE-023 Stage 2 (categories)", () => {
  it("config.categories 'off' drops by the diagnostic's category", () => {
    const stage = makeSeverityStage({ categories: { "Type Safety": "off" } });
    expect(stage(diag({ rule: "r", category: "Type Safety" }))).toBeNull();
  });

  it("config.categories 'warn' remaps severity by category", () => {
    const stage = makeSeverityStage({ categories: { "Type Safety": "warn" } });
    const out = stage(diag({ rule: "r", category: "Type Safety", severity: "error" }));
    expect(out?.severity).toBe("warning");
  });
});

describe("makeSeverityStage — RULE-040 (rules precedence over categories)", () => {
  it("a matching rules entry wins over a matching categories entry", () => {
    // rule says 'warn', category says 'off' — rule precedence => survives as warning.
    const stage = makeSeverityStage({
      rules: { r: "warn" },
      categories: { "Type Safety": "off" },
    });
    const out = stage(diag({ rule: "r", category: "Type Safety", severity: "error" }));
    expect(out?.severity).toBe("warning");
  });

  it("rule precedence applies even when rule 'off' and category 'error'", () => {
    const stage = makeSeverityStage({
      rules: { r: "off" },
      categories: { "Type Safety": "error" },
    });
    expect(stage(diag({ rule: "r", category: "Type Safety" }))).toBeNull();
  });

  it("falls back to category when no rule entry matches", () => {
    const stage = makeSeverityStage({
      rules: { other: "off" },
      categories: { "Type Safety": "warn" },
    });
    const out = stage(diag({ rule: "r", category: "Type Safety", severity: "error" }));
    expect(out?.severity).toBe("warning");
  });
});

describe("makeSeverityStage — RULE-023 Stage 2 (empty config = identity)", () => {
  it("empty config returns the diagnostic unchanged", () => {
    const stage = makeSeverityStage({});
    const input = diag({ rule: "r" });
    expect(stage(input)).toBe(input);
  });
});
