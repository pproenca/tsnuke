import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/ts-expect-error-requires-description.js";

// Ported VERBATIM from legacy `.../type-assertions/ts-expect-error-requires-description.test.ts`,
// plus metadata + comment-rule edges (bare vs described directive).
describe("ts-expect-error-requires-description (SYN)", () => {
  it("flags a bare @ts-expect-error", () => {
    const diags = runRule(rule, "// @ts-expect-error\nx;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("ts-expect-error-requires-description");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.line).toBe(1);
  });

  it("accepts a described @ts-expect-error", () => {
    expect(runRule(rule, "// @ts-expect-error -- upstream types wrong\nx;\n")).toHaveLength(0);
  });

  // Edge: a @ts-expect-error with ANY trailing text (the BARE regex requires
  // the line to end immediately after the directive).
  it("accepts `// @ts-expect-error reason text`", () => {
    expect(runRule(rule, "// @ts-expect-error see #123\nx;\n")).toHaveLength(0);
  });

  // Edge: multiple bare directives are each flagged.
  it("flags each bare directive", () => {
    expect(
      runRule(rule, "// @ts-expect-error\na();\n// @ts-expect-error\nb();\n"),
    ).toHaveLength(2);
  });
});
