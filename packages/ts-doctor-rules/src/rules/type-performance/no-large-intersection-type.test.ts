import { describe, expect, it } from "vitest";
import { rule } from "./no-large-intersection-type.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — no-large-intersection-type", () => {
  it("flags an intersection with more than 5 members", () => {
    const diags = runRule(
      rule,
      "type T = { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 };\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-large-intersection-type");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("does not flag a small intersection", () => {
    expect(runRule(rule, "type T = { a: 1 } & { b: 2 };\n")).toHaveLength(0);
  });
});
