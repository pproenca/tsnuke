import { describe, expect, it } from "vitest";
import { rule } from "./no-angle-bracket-assertion.js";
import { runRule } from "../../test-utils.js";

describe("no-angle-bracket-assertion (SYN)", () => {
  it("flags an angle-bracket cast `<T>x`", () => {
    const diags = runRule(
      rule,
      "declare const y: unknown;\nconst x = <string>y;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("as T");
  });

  it("does not flag the `x as T` form", () => {
    expect(
      runRule(rule, "declare const y: unknown;\nconst x = y as string;\n"),
    ).toHaveLength(0);
  });
});
