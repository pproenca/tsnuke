import { describe, expect, it } from "vitest";
import { rule } from "./no-export-assignment.js";
import { runRule } from "../../test-utils.js";

describe("no-export-assignment (SYN)", () => {
  it("flags `export = …`", () => {
    const diags = runRule(rule, "export = 42;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-export-assignment");
  });

  it("allows `export default …`", () => {
    expect(runRule(rule, "export default 42;\n")).toHaveLength(0);
  });
});
