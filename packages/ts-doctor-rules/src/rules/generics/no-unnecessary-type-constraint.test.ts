import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-type-constraint.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — no-unnecessary-type-constraint", () => {
  it("flags `<T extends any>` as a no-op constraint", () => {
    const diags = runRule(rule, "function f<T extends any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-unnecessary-type-constraint");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("flags `<T extends unknown>` as a no-op constraint", () => {
    const diags = runRule(
      rule,
      "function f<T extends unknown>(x: T) { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("unknown");
  });

  it("does not flag a real constraint", () => {
    expect(
      runRule(rule, "function f<T extends string>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });
});
