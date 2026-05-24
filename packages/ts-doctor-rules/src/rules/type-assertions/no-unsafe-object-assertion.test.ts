import { describe, expect, it } from "vitest";
import { rule } from "./no-unsafe-object-assertion.js";
import { runRule } from "../../test-utils.js";

describe("no-unsafe-object-assertion (SYN)", () => {
  it("flags asserting an inline shape (union) onto a value", () => {
    const code =
      "declare const error: unknown;\n" +
      "const r = error as { exitCode?: number } | null | undefined;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `value as Record<...>`", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst r = x as Record<string, number>;\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a literal cast (that's prefer-satisfies-over-as)", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as { a: number };\n")).toHaveLength(0);
  });

  it("does NOT flag asserting to a named type", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst r = x as MyType;\n"),
    ).toHaveLength(0);
  });
});
