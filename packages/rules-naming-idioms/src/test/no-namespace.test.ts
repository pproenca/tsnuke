import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-namespace.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-namespace.test.ts`.
describe("no-namespace (SYN)", () => {
  it("flags a namespace declaration", () => {
    const diags = runRule(rule, "namespace Foo { export const x = 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("Foo");
    expect(diags[0]!.rule).toBe("no-namespace");
    expect(diags[0]!.severity).toBe("warning");
  });

  it('does not flag an ambient `declare module "pkg"`', () => {
    expect(
      runRule(rule, 'declare module "pkg" { export const x: number; }\n'),
    ).toHaveLength(0);
  });

  // Edge (verbatim coverage): `module X {}` with an identifier name is also flagged.
  it("flags `module X {}` with an identifier name", () => {
    expect(runRule(rule, "module Bar { export const y = 1; }\n")).toHaveLength(1);
  });
});
