import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-new-buffer.js";

describe("SYN rule — no-new-buffer", () => {
  // --- Ported legacy vectors (the equivalence spec) -------------------------
  it("flags `new Buffer(...)`", () => {
    const diags = runRule(rule, 'const b = new Buffer("x");\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-new-buffer");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("error");
  });

  it("does not flag `Buffer.from(...)`", () => {
    expect(runRule(rule, 'const b = Buffer.from("x");\n')).toHaveLength(0);
  });

  // --- Added: message / help / position equivalence ------------------------
  it("emits the exact message, help, category and 1-based position", () => {
    const diags = runRule(rule, 'const b = new Buffer("x");\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Security");
    expect(d.message).toBe("`new Buffer()` is deprecated and unsafe.");
    expect(d.help).toBe(
      "`new Buffer()` is deprecated and unsafe (uninitialized memory); use `Buffer.from()` / `Buffer.alloc()`.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(11); // `new` begins at the 11th char
  });

  // --- Added negatives -----------------------------------------------------
  it("does not flag `Buffer.alloc(...)`", () => {
    expect(runRule(rule, "const b = Buffer.alloc(8);\n")).toHaveLength(0);
  });

  it("does not flag `new MyBuffer(...)` (callee name must be exactly Buffer)", () => {
    expect(runRule(rule, "const b = new MyBuffer();\n")).toHaveLength(0);
  });

  it("does not flag a bare `Buffer` reference", () => {
    expect(runRule(rule, "const B = Buffer;\n")).toHaveLength(0);
  });
});
