import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-useless-else.js";

describe("no-useless-else (SYN)", () => {
  it("flags `else` after a bare `return` in the consequent", () => {
    const diags = runRule(
      rule,
      "function f(c: boolean) {\n  if (c) return 1;\n  else return 2;\n}\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-useless-else");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("Drop the `else`");
  });

  it("flags `else` after a `throw`", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  if (c) throw new Error('x');\n  else return 0;\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("flags `else` after `continue` inside a loop", () => {
    expect(
      runRule(
        rule,
        "for (const x of [1, 2]) {\n  if (x === 1) continue;\n  else console.log(x);\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("flags `else` after `break` inside a loop", () => {
    expect(
      runRule(
        rule,
        "for (const x of [1, 2]) {\n  if (x === 1) break;\n  else console.log(x);\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("flags when the consequent is a Block whose last statement terminates", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  if (c) {\n    console.log('a');\n    return 1;\n  } else {\n    return 2;\n  }\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("flags the chained `else if` form (consequent returns)", () => {
    // `if (c) return; else if (c2) ...` — the `else` clause is still useless;
    // the codebase prefers a flat `if (c) return; if (c2) ...` cascade.
    expect(
      runRule(
        rule,
        "function f(c: boolean, c2: boolean) {\n  if (c) return 1;\n  else if (c2) return 2;\n  return 3;\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("does NOT flag when the consequent falls through (no terminator)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x = 0;\n  if (c) x = 1;\n  else x = 2;\n  return x;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag a bare `if` (no `else`)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  if (c) return 1;\n  return 2;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag when the consequent's LAST statement is a non-terminator (block path)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  if (c) {\n    return 1;\n    console.log('unreachable');\n  } else {\n    return 2;\n  }\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("reports at the `else` keyword's line:column", () => {
    const diags = runRule(
      rule,
      "function f(c: boolean) {\n  if (c) return 1;\n  else return 2;\n}\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.line).toBe(3);
    expect(d.column).toBe(3);
  });
});
