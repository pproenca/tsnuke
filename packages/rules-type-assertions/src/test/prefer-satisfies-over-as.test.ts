import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-satisfies-over-as.js";

// Ported VERBATIM from legacy `.../type-assertions/prefer-satisfies-over-as.test.ts`,
// plus metadata + `as any` / `as unknown` exemption edges.
describe("prefer-satisfies-over-as (SYN)", () => {
  it("flags an object literal `as` a named type", () => {
    const diags = runRule(rule, "const cfg = { a: 1 } as Config;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("satisfies");
    expect(diags[0]!.rule).toBe("prefer-satisfies-over-as");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("flags an array literal `as` a named type", () => {
    const diags = runRule(rule, "const xs = [1, 2] as ReadonlyArray<number>;\n");
    expect(diags).toHaveLength(1);
  });

  it("does not flag `as const`", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as const;\n")).toHaveLength(0);
  });

  it("does not flag a non-literal expression", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst v = x as Config;\n"),
    ).toHaveLength(0);
  });

  // Edge: `{ ... } as any` is exempt (other escape-hatch rules own that).
  it("does not flag an object literal `as any`", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as any;\n")).toHaveLength(0);
  });

  // Edge: `{ ... } as unknown` is exempt.
  it("does not flag an object literal `as unknown`", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as unknown;\n")).toHaveLength(0);
  });
});
