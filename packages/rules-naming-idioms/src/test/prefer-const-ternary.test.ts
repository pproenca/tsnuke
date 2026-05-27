import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-const-ternary.js";

describe("prefer-const-ternary (SYN)", () => {
  it("flags `let x; if (c) x = a; else x = b;` (bare statements)", () => {
    const diags = runRule(
      rule,
      "function f(c: boolean) {\n  let x;\n  if (c) x = 1;\n  else x = 2;\n  return x;\n}\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-const-ternary");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("`let x`");
    expect(diags[0]!.message).toContain("fold into");
  });

  it("flags the same shape with single-statement Blocks on each branch", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let foo;\n  if (c) {\n    foo = 1;\n  } else {\n    foo = 2;\n  }\n  return foo;\n}\n",
      ),
    ).toHaveLength(1);
  });

  it("flags at the top level (SourceFile scope)", () => {
    expect(
      runRule(
        rule,
        "declare const c: boolean;\nlet x;\nif (c) x = 1;\nelse x = 2;\n",
      ),
    ).toHaveLength(1);
  });

  it("does NOT flag when the `let` has an initializer", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x = 0;\n  if (c) x = 1;\n  else x = 2;\n  return x;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag when the if is not immediately after the let", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x;\n  console.log('between');\n  if (c) x = 1;\n  else x = 2;\n  return x;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag a chained `else if` (multi-way, not binary fold)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean, c2: boolean) {\n  let x;\n  if (c) x = 1;\n  else if (c2) x = 2;\n  else x = 3;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag when branches assign to different identifiers", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x;\n  let y;\n  if (c) x = 1;\n  else y = 2;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag when a branch block has multiple statements (may have side effects)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x;\n  if (c) {\n    console.log('side');\n    x = 1;\n  } else {\n    x = 2;\n  }\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag when the `let` declares multiple bindings", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let x, y;\n  if (c) x = 1;\n  else x = 2;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag a destructuring `let` binding", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  let [x] = [0];\n  if (c) x = 1;\n  else x = 2;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag a `const`-prefixed let (i.e. plain `const`)", () => {
    expect(
      runRule(
        rule,
        "function f(c: boolean) {\n  const x = c ? 1 : 2;\n  return x;\n}\n",
      ),
    ).toHaveLength(0);
  });
});
