import { describe, expect, it } from "vitest";
import { rule } from "./no-empty-interface.js";
import { runRule } from "../../test-utils.js";

describe("no-empty-interface (SYN)", () => {
  it("flags an empty interface with no members or heritage", () => {
    const diags = runRule(rule, "interface X {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("X");
  });

  it("does not flag an interface with members", () => {
    expect(runRule(rule, "interface Y { a: number }\n")).toHaveLength(0);
  });

  it("does not flag an empty interface that extends a base", () => {
    expect(
      runRule(rule, "interface Base { a: number }\ninterface Z extends Base {}\n"),
    ).toHaveLength(0);
  });
});
