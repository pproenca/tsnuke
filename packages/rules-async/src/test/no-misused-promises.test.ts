import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-misused-promises.js";

describe("no-misused-promises (TYP / BC-10) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a Promise used as an `if` condition under a live checker", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { if (p()) { g(); } }\ndeclare function g(): void;\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-misused-promises");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("flags a Promise used as a `while` condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { while (p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("flags a Promise used as a ternary condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { return p() ? 1 : 2; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("does not flag a plain boolean condition", () => {
    const code =
      "declare function p(): boolean;\nfunction f() { if (p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag an awaited promise condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nasync function f() { if (await p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { if (p()) {} }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape + position ---

  it("reports the full diagnostic (category/plugin/message/help/position)", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { if (p()) {} }\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe(
      "Promise used as a condition: a Promise is always truthy (missing `await`?).",
    );
    expect(d.help).toBe(
      "Prefix with `await` (inside an async function) so the condition tests the resolved value.",
    );
    // Position pins to the condition `p()` on line 2, col 20
    // (1-based: `function f() { if (` = 19 chars).
    expect(d.line).toBe(2);
    expect(d.column).toBe(20);
    // No fix payload (only no-floating-promises emits one).
    expect(d.fix).toBeUndefined();
  });

  // --- Added: a Promise used as a `do-while` condition fires too ---

  it("flags a Promise used as a `do-while` condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { do {} while (p()); }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });
});
