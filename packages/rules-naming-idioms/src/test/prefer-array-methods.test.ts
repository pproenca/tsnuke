import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-array-methods.js";

// Ported VERBATIM from legacy `.../naming-idioms/prefer-array-methods.test.ts`.
describe("prefer-array-methods (SYN)", () => {
  it("flags a for-of loop that only pushes into an accumulator", () => {
    const diags = runRule(
      rule,
      "const out = [];\nfor (const x of xs) { out.push(x * 2); }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain(".map()");
    expect(diags[0]!.rule).toBe("prefer-array-methods");
  });

  it("flags a push-only loop guarded by an `if` (filter in disguise)", () => {
    const diags = runRule(
      rule,
      "const out = [];\nfor (const x of xs) { if (x > 0) out.push(x); }\n",
    );
    expect(diags).toHaveLength(1);
  });

  it("flags a classic indexed for loop that only pushes", () => {
    const diags = runRule(
      rule,
      "const out = [];\nfor (let i = 0; i < xs.length; i++) out.push(xs[i]);\n",
    );
    expect(diags).toHaveLength(1);
  });

  it("does not flag a multi-statement loop body", () => {
    expect(
      runRule(rule, "for (const x of xs) { process(x); doMore(x); }\n"),
    ).toHaveLength(0);
  });

  it("does not flag a push-loop that also has an else branch", () => {
    expect(
      runRule(
        rule,
        "const out = [];\nfor (const x of xs) { if (x) out.push(x); else skip(x); }\n",
      ),
    ).toHaveLength(0);
  });
});
