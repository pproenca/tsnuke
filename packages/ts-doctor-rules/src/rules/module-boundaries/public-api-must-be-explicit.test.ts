import { describe, expect, it } from "vitest";
import { rule } from "./public-api-must-be-explicit.js";
import { runRule } from "../../test-utils.js";

describe("public-api-must-be-explicit (SYN)", () => {
  it("flags a wildcard re-export", () => {
    const diags = runRule(rule, 'export * from "./mod";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("public-api-must-be-explicit");
  });

  it("allows explicit named re-exports", () => {
    expect(runRule(rule, 'export { a, b } from "./mod";\n')).toHaveLength(0);
  });
});
