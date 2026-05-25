import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-floating-promises.js";

describe("no-floating-promises (TYP / BC-10) — RULE-025 / RULE-032 (the ONE real fix)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a floating promise under a live checker", () => {
    const diags = runTypeAwareRule(rule, "Promise.resolve(1);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-floating-promises");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
    // Carries a machine-applicable fix with the inferred promise type (BC-14).
    expect(diags[0]!.fix?.kind).toBe("auto-fix");
    expect(diags[0]!.fix?.inferredType).toContain("Promise");
  });

  it("does not flag an awaited promise", () => {
    const diags = runTypeAwareRule(
      rule,
      "async function f() { await Promise.resolve(1); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("does not flag a voided promise", () => {
    expect(runTypeAwareRule(rule, "void Promise.resolve(1);\n")).toHaveLength(0);
  });

  it("does not flag a non-promise expression statement", () => {
    expect(runTypeAwareRule(rule, "declare const x: number;\nx;\n")).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(runRule(rule, "Promise.resolve(1);\n")).toHaveLength(0);
  });

  // --- THE REAL FIX: assert the exact edit (kind + offsets + replacement) ---
  // This is the ONLY rule in the entire ts-doctor catalog that attaches a real
  // `fix` payload (RULE-025 / RULE-032). The fix inserts `void ` (zero-width edit)
  // before the floating expression. For `Promise.resolve(1);\n` the expression
  // starts at offset 0, so the edit is `{ start: 0, end: 0, replacement: "void " }`.

  it("attaches a real auto-fix: a zero-width `void ` insert at the expression start", () => {
    const diags = runTypeAwareRule(rule, "Promise.resolve(1);\n");
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.kind).toBe("auto-fix");
    expect(fix!.edits).toHaveLength(1);
    const edit = fix!.edits[0]!;
    // Zero-width insert (`start === end`) at offset 0 (start of `Promise.resolve(1)`).
    expect(edit.start).toBe(0);
    expect(edit.end).toBe(0);
    expect(edit.replacement).toBe("void ");
  });

  it("places the `void ` insert at the expression start when the statement is indented", () => {
    // `  Promise.resolve(1);` — the expression `Promise…` starts at offset 2 (after
    // two leading spaces), so the zero-width edit pins to offset 2, not 0.
    const code = "function f() {\n  Promise.resolve(1);\n}\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    const edit = diags[0]!.fix!.edits[0]!;
    const expectedStart = code.indexOf("Promise.resolve(1)");
    expect(edit.start).toBe(expectedStart);
    expect(edit.end).toBe(expectedStart);
    expect(edit.replacement).toBe("void ");
  });

  it("the inferredType is the checker's string for the floating Promise type", () => {
    const diags = runTypeAwareRule(rule, "Promise.resolve(1);\n");
    expect(diags[0]!.fix!.inferredType).toBe("Promise<number>");
  });

  // --- Full diagnostic shape + position ---

  it("reports the full diagnostic (category/plugin/message/help/position)", () => {
    const diags = runTypeAwareRule(rule, "Promise.resolve(1);\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe(
      "Floating promise: this Promise is never awaited or handled.",
    );
    expect(d.help).toBe(
      "Prefix with `await` (inside an async function), `return` it, or `void` it to explicitly ignore.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added negatives: returned / assigned promises are handled, not floating ---

  it("does not flag a returned promise", () => {
    const code =
      "function f(): Promise<number> { return Promise.resolve(1); }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag a promise assigned to a variable (assignment consumes the value)", () => {
    const code = "let p: Promise<number>;\np = Promise.resolve(1);\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });
});
