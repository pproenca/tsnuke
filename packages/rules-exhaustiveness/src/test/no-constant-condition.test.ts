import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-constant-condition.js";

describe("no-constant-condition (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags an if with a literal condition", () => {
    const diags = runRule(rule, "if (true) { f(); }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-constant-condition");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("constant condition");
  });

  it("flags a conditional (ternary) with a literal condition", () => {
    expect(runRule(rule, "const x = 1 ? a : b;\n")).toHaveLength(1);
  });

  it("does not flag an if with a real predicate", () => {
    expect(runRule(rule, "if (x) { f(); }\n")).toHaveLength(0);
  });

  it("does not flag while(true) — a legitimate loop idiom", () => {
    expect(runRule(rule, "while (true) { f(); }\n")).toHaveLength(0);
  });

  // --- Added edge cases (string/numeric literals, full shape, position) ---

  it("flags a string-literal if condition", () => {
    expect(runRule(rule, 'if ("x") { f(); }\n')).toHaveLength(1);
  });

  it("flags a no-substitution template literal if condition", () => {
    expect(runRule(rule, "if (`x`) { f(); }\n")).toHaveLength(1);
  });

  it("does not flag a for-loop with a literal-ish condition", () => {
    // The rule only visits IfStatement / ConditionalExpression — for is exempt.
    expect(runRule(rule, "for (;;) { f(); }\n")).toHaveLength(0);
  });

  it("carries the verbatim message/help + meta and reports at the condition", () => {
    const diags = runRule(rule, "if (true) { f(); }\n");
    expect(diags[0]!.message).toBe(
      "constant condition: this branch is always taken or never taken",
    );
    expect(diags[0]!.help).toBe(
      "Use a real predicate, or remove the unreachable branch.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
    expect(diags[0]!.tier).toBe("SYN");
    // `if (` is 4 chars; `true` begins at 0-based char 4 ⇒ column 5.
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(5);
  });
});
