import { describe, expect, it } from "vitest";
import { rule } from "./no-cast-in-return.js";
import { runRule } from "../../test-utils.js";

describe("no-cast-in-return (SYN)", () => {
  it("flags a cast in a return of a function with an explicit return type", () => {
    const diags = runRule(
      rule,
      "declare const x: unknown;\nfunction f(): number { return x as number; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("return");
  });

  it("does not flag a return without a cast", () => {
    expect(runRule(rule, "function f(): number { return 1; }\n")).toHaveLength(0);
  });

  it("does not flag a cast when there is no explicit return type", () => {
    expect(
      runRule(
        rule,
        "declare const x: unknown;\nfunction f() { return x as number; }\n",
      ),
    ).toHaveLength(0);
  });
});
