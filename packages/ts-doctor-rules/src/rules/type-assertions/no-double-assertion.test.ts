import { describe, expect, it } from "vitest";
import { rule } from "./no-double-assertion.js";
import { runRule } from "../../test-utils.js";

describe("no-double-assertion (SYN)", () => {
  it("flags `x as unknown as T`", () => {
    const diags = runRule(
      rule,
      "declare const y: unknown;\nconst x = y as unknown as string;\n",
    );
    expect(diags).toHaveLength(1);
  });

  it("allows a single assertion", () => {
    expect(
      runRule(rule, "declare const y: unknown;\nconst x = y as string;\n"),
    ).toHaveLength(0);
  });
});
