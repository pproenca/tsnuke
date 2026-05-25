/**
 * Characterization tests for `resolveSeverity` — RULE-019 (severity resolution half).
 *
 * RULE-019: a rule registers at severity `explicit ?? rule.severity`, EXCEPT that
 * an explicit `"off"` resolves to `null` (the rule is skipped). Three cases:
 *   - explicit === "off"      -> null
 *   - explicit is a Severity  -> the explicit override (wins over rule.severity)
 *   - explicit === undefined  -> rule.severity (default fall-through)
 */

import { describe, expect, it } from "vitest";
import { resolveSeverity } from "../main/index.js";
import type { RuleMeta } from "../main/index.js";

function rule(over: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id: "r",
    severity: "warning",
    category: "test",
    tier: "SYN",
    ...over,
  } as RuleMeta;
}

describe("resolveSeverity — RULE-019 (explicit 'off' -> null)", () => {
  it("explicit 'off' -> null regardless of rule.severity", () => {
    expect(resolveSeverity(rule({ severity: "error" }), "off")).toBeNull();
    expect(resolveSeverity(rule({ severity: "warning" }), "off")).toBeNull();
  });
});

describe("resolveSeverity — RULE-019 (explicit override wins)", () => {
  it("explicit 'error' overrides a 'warning' default", () => {
    expect(resolveSeverity(rule({ severity: "warning" }), "error")).toBe("error");
  });

  it("explicit 'warning' overrides an 'error' default", () => {
    expect(resolveSeverity(rule({ severity: "error" }), "warning")).toBe("warning");
  });

  it("explicit equal to the default still returns that severity", () => {
    expect(resolveSeverity(rule({ severity: "error" }), "error")).toBe("error");
  });
});

describe("resolveSeverity — RULE-019 (default fall-through)", () => {
  it("explicit undefined -> rule.severity ('error')", () => {
    expect(resolveSeverity(rule({ severity: "error" }), undefined)).toBe("error");
  });

  it("explicit undefined -> rule.severity ('warning')", () => {
    expect(resolveSeverity(rule({ severity: "warning" }), undefined)).toBe("warning");
  });

  it("explicit omitted entirely -> rule.severity (the default arg path)", () => {
    expect(resolveSeverity(rule({ severity: "warning" }))).toBe("warning");
  });
});
