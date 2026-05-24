import { describe, expect, it } from "vitest";
import { rule } from "./no-default-export.js";
import { runRule } from "../../test-utils.js";

describe("no-default-export (SYN)", () => {
  it("flags `export default <expr>`", () => {
    const diags = runRule(rule, "export default 42;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-default-export");
  });

  it("flags `export default function`", () => {
    const diags = runRule(rule, "export default function f() {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-default-export");
  });

  it("allows a named export", () => {
    expect(runRule(rule, "export const x = 1;\n")).toHaveLength(0);
  });
});
