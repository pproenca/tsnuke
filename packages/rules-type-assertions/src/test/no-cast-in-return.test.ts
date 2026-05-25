import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-cast-in-return.js";

// Ported VERBATIM from legacy `.../type-assertions/no-cast-in-return.test.ts`,
// plus metadata + arrow-function and method edges.
describe("no-cast-in-return (SYN)", () => {
  it("flags a cast in a return of a function with an explicit return type", () => {
    const diags = runRule(
      rule,
      "declare const x: unknown;\nfunction f(): number { return x as number; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("return");
    expect(diags[0]!.rule).toBe("no-cast-in-return");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag a return without a cast", () => {
    expect(runRule(rule, "function f(): number { return 1; }\n")).toHaveLength(0);
  });

  it("does not flag a cast when there is no explicit return type", () => {
    expect(
      runRule(
        rule,
        "declare const x: unknown;\nfunction f() { return x as number; }\n",
      ),
    ).toHaveLength(0);
  });

  // Edge: arrow function with an explicit return type + a return-statement body.
  it("flags a cast returned from an arrow with an explicit return type", () => {
    expect(
      runRule(
        rule,
        "declare const x: unknown;\nconst f = (): number => { return x as number; };\n",
      ),
    ).toHaveLength(1);
  });

  // Edge: method declaration with an explicit return type.
  it("flags a cast in a method with an explicit return type", () => {
    expect(
      runRule(
        rule,
        "declare const x: unknown;\nclass C { m(): number { return x as number; } }\n",
      ),
    ).toHaveLength(1);
  });
});
