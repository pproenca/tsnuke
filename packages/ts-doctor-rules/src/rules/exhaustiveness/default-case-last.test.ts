import { describe, expect, it } from "vitest";
import { rule } from "./default-case-last.js";
import { runRule } from "../../test-utils.js";

describe("default-case-last (SYN)", () => {
  it("flags a switch whose default is not last", () => {
    const diags = runRule(
      rule,
      "switch (x) { default: break; case 1: break; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("default-case-last");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("`default` clause should come last");
  });

  it("does not flag a switch whose default is last", () => {
    expect(
      runRule(rule, "switch (x) { case 1: break; default: break; }\n"),
    ).toHaveLength(0);
  });

  it("does not flag a switch with no default", () => {
    expect(
      runRule(rule, "switch (x) { case 1: break; case 2: break; }\n"),
    ).toHaveLength(0);
  });
});
