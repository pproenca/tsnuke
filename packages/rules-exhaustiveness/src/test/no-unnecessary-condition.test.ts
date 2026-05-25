import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unnecessary-condition.js";

describe("no-unnecessary-condition (TYP / BC-10)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags an always-truthy non-empty object condition", () => {
    const code =
      "declare const o: { a: number };\nif (o) { f(); }\ndeclare function f(): void;\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-condition");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toBe("condition is always truthy");
  });

  it("does not flag a nullable condition", () => {
    const code = "declare const s: string | undefined;\nif (s) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag the empty object type `{}`", () => {
    const code = "declare const e: {};\nif (e) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag a primitive condition", () => {
    const code = "declare const n: number;\nif (n) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    const code = "declare const o: { a: number };\nif (o) {}\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // --- Added edge cases (while/do/ternary visitors, negatives, help + position) ---

  it("flags an always-truthy object in a `while` condition", () => {
    const code = "declare const o: { a: number };\nwhile (o) { break; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("flags an always-truthy object in a `do...while` condition", () => {
    const code = "declare const o: { a: number };\ndo { break; } while (o);\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("flags an always-truthy object in a ternary condition", () => {
    const code = "declare const o: { a: number };\nconst r = o ? 1 : 2;\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a nullable object (`{ a: number } | undefined`)", () => {
    const code =
      "declare const o: { a: number } | undefined;\nif (o) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("carries the verbatim help and reports at the condition position", () => {
    const code = "declare const o: { a: number };\nif (o) {}\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags[0]!.help).toBe(
      "Remove the redundant check, or widen the type (e.g. `| undefined`) if the value can actually be absent.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
    // line 2: `if (` is 4 chars; `o` begins at 0-based char 4 ⇒ column 5.
    expect(diags[0]!.line).toBe(2);
    expect(diags[0]!.column).toBe(5);
  });
});
