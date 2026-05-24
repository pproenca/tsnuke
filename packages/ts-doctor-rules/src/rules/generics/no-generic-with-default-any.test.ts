import { describe, expect, it } from "vitest";
import { rule } from "./no-generic-with-default-any.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — no-generic-with-default-any", () => {
  it("flags `<T = any>` default", () => {
    const diags = runRule(rule, "function f<T = any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-generic-with-default-any");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("does not flag a non-any default like `<T = unknown>`", () => {
    expect(
      runRule(rule, "function f<T = unknown>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });
});
