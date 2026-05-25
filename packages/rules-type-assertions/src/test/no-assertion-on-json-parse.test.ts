import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-assertion-on-json-parse.js";

// Ported VERBATIM from legacy `.../type-assertions/no-assertion-on-json-parse.test.ts`,
// plus metadata assertions, a parenthesized-call edge, and negatives.
describe("no-assertion-on-json-parse (SYN)", () => {
  it("flags `JSON.parse(...) as T`", () => {
    const diags = runRule(
      rule,
      "declare const raw: string;\nconst data = JSON.parse(raw) as { id: number };\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("JSON.parse");
    expect(diags[0]!.rule).toBe("no-assertion-on-json-parse");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag an unasserted `JSON.parse`", () => {
    expect(
      runRule(rule, "declare const raw: string;\nconst data = JSON.parse(raw);\n"),
    ).toHaveLength(0);
  });

  // Edge: parentheses around the call are unwrapped.
  it("flags `(JSON.parse(raw)) as T`", () => {
    expect(
      runRule(
        rule,
        "declare const raw: string;\nconst d = (JSON.parse(raw)) as { id: number };\n",
      ),
    ).toHaveLength(1);
  });

  // Negative: a different `.parse` is not JSON.parse.
  it("does not flag `Foo.parse(raw) as T`", () => {
    expect(
      runRule(
        rule,
        "declare const Foo: { parse(s: string): unknown };\ndeclare const raw: string;\nconst d = Foo.parse(raw) as { id: number };\n",
      ),
    ).toHaveLength(0);
  });

  // Negative: `JSON.stringify(...) as T` is not parse.
  it("does not flag `JSON.stringify(x) as T`", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst s = JSON.stringify(x) as string;\n"),
    ).toHaveLength(0);
  });
});
