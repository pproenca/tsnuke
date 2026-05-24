import { describe, expect, it } from "vitest";
import { rule } from "./no-for-in-array.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-for-in-array (TYP / BC-10)", () => {
  it("flags `for...in` over an array under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "const arr = [1, 2, 3];\nfor (const k in arr) { console.log(k); }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-for-in-array");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("flags `for...in` over a readonly array", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const arr: readonly string[];\nfor (const k in arr) { console.log(k); }\n",
    );
    expect(diags).toHaveLength(1);
  });

  it("does not flag `for...in` over a plain object (legitimate use)", () => {
    const diags = runTypeAwareRule(
      rule,
      "const obj: Record<string, number> = { a: 1 };\nfor (const k in obj) { console.log(k); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("does not flag `for...of` over an array", () => {
    const diags = runTypeAwareRule(
      rule,
      "const arr = [1, 2, 3];\nfor (const v of arr) { console.log(v); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        "const arr = [1, 2, 3];\nfor (const k in arr) { console.log(k); }\n",
      ),
    ).toHaveLength(0);
  });
});
