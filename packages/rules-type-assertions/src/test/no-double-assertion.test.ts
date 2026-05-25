import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-double-assertion.js";

// Ported VERBATIM from legacy `.../type-assertions/no-double-assertion.test.ts`,
// plus error-severity + `as any as T` and parenthesized edges.
describe("no-double-assertion (SYN)", () => {
  it("flags `x as unknown as T`", () => {
    const diags = runRule(
      rule,
      "declare const y: unknown;\nconst x = y as unknown as string;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-double-assertion");
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("allows a single assertion", () => {
    expect(
      runRule(rule, "declare const y: unknown;\nconst x = y as string;\n"),
    ).toHaveLength(0);
  });

  // Edge: `x as any as T`.
  it("flags `x as any as T`", () => {
    expect(
      runRule(rule, "declare const y: string;\nconst x = y as any as number;\n"),
    ).toHaveLength(1);
  });

  // Edge: parenthesized inner assertion `(x as A) as B`.
  it("flags `(y as unknown) as T`", () => {
    expect(
      runRule(rule, "declare const y: unknown;\nconst x = (y as unknown) as string;\n"),
    ).toHaveLength(1);
  });
});
