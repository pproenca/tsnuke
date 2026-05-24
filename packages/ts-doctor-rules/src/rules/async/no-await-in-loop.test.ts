import { describe, expect, it } from "vitest";
import { rule } from "./no-await-in-loop.js";
import { runRule } from "../../test-utils.js";

describe("no-await-in-loop (SYN)", () => {
  it("flags an await inside a for-of loop", () => {
    const diags = runRule(
      rule,
      "async function f(xs: number[]) { for (const x of xs) { await Promise.resolve(x); } }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-await-in-loop");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag an await outside any loop", () => {
    expect(
      runRule(rule, "async function f() { await Promise.resolve(1); }\n"),
    ).toHaveLength(0);
  });
});
