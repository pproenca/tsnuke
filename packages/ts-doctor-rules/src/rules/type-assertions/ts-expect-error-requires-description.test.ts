import { describe, expect, it } from "vitest";
import { rule } from "./ts-expect-error-requires-description.js";
import { runRule } from "../../test-utils.js";

describe("ts-expect-error-requires-description (SYN)", () => {
  it("flags a bare @ts-expect-error", () => {
    expect(runRule(rule, "// @ts-expect-error\nx;\n")).toHaveLength(1);
  });

  it("accepts a described @ts-expect-error", () => {
    expect(runRule(rule, "// @ts-expect-error -- upstream types wrong\nx;\n")).toHaveLength(0);
  });
});
