import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-unnecessary-boolean-literal-compare.js";

describe("no-unnecessary-boolean-literal-compare (TYP / BC-10)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags comparing a boolean to a boolean literal under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const b: boolean;\nfunction f() { return b === true; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-boolean-literal-compare");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag comparing a non-boolean to a string literal", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const s: string;\nfunction f() { return s === "true"; }\n',
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        "declare const b: boolean;\nfunction f() { return b === true; }\n",
      ),
    ).toHaveLength(0);
  });

  // --- Added edge cases (other operators/literal side, negatives, full shape) ---

  it("flags `!== false` against a boolean value", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare const b: boolean;\nfunction f() { return b !== false; }\n",
      ),
    ).toHaveLength(1);
  });

  it("flags the literal on the LEFT side (`true === b`)", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare const b: boolean;\nfunction f() { return true === b; }\n",
      ),
    ).toHaveLength(1);
  });

  it("does NOT flag comparing two boolean literals (both sides literal)", () => {
    expect(
      runTypeAwareRule(rule, "function f() { return true === false; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a non-comparison binary op (`b && true`)", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare const b: boolean;\nfunction f() { return b && true; }\n",
      ),
    ).toHaveLength(0);
  });

  it("carries the verbatim message/help + meta", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const b: boolean;\nfunction f() { return b === true; }\n",
    );
    expect(diags[0]!.message).toBe(
      "Comparing a boolean to a boolean literal is redundant; use the value directly.",
    );
    expect(diags[0]!.help).toBe(
      "Drop the `=== true` / `!== false` comparison and use the boolean value (or its negation) directly.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
  });
});
