import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-implied-eval.js";

describe("no-implied-eval (SYN)", () => {
  // --- Ported legacy vectors (the equivalence spec) -------------------------
  it("flags a string-argument setTimeout", () => {
    const diags = runRule(rule, 'setTimeout("doStuff()", 100);\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag a function-argument setTimeout", () => {
    expect(runRule(rule, "setTimeout(() => doStuff(), 100);\n")).toHaveLength(0);
  });

  // --- Added: shape / message equivalence ----------------------------------
  it("emits the exact message, help, severity and position", () => {
    const diags = runRule(rule, 'setTimeout("doStuff()", 100);\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-implied-eval");
    expect(d.severity).toBe("error");
    expect(d.category).toBe("Security");
    expect(d.message).toBe(
      "string-argument setTimeout/setInterval is an implied eval",
    );
    expect(d.help).toBe(
      "Pass a function instead of a string, e.g. `setTimeout(() => doStuff(), 100)`.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: the other timer + member-call + template variants ------------
  it("flags a string-argument setInterval", () => {
    expect(runRule(rule, 'setInterval("tick()", 100);\n')).toHaveLength(1);
  });

  it("flags a member-call timer (window.setTimeout) with a string arg", () => {
    expect(runRule(rule, 'window.setTimeout("doStuff()", 100);\n')).toHaveLength(
      1,
    );
  });

  it("flags a no-substitution-template-literal first argument", () => {
    expect(runRule(rule, "setTimeout(`doStuff()`, 100);\n")).toHaveLength(1);
  });

  it("flags a template-expression first argument", () => {
    expect(runRule(rule, "setTimeout(`do${x}()`, 100);\n")).toHaveLength(1);
  });

  // --- Added negatives -----------------------------------------------------
  it("does not flag a function-reference argument", () => {
    expect(runRule(rule, "setTimeout(doStuff, 100);\n")).toHaveLength(0);
  });

  it("does not flag a string-argument setInterval to an unrelated callee", () => {
    expect(runRule(rule, 'logAfter("doStuff()", 100);\n')).toHaveLength(0);
  });

  it("does not flag setTimeout with no arguments", () => {
    expect(runRule(rule, "setTimeout();\n")).toHaveLength(0);
  });
});
