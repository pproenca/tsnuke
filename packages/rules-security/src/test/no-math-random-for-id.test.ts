import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-math-random-for-id.js";

describe("no-math-random-for-id (SYN)", () => {
  it("flags `Math.random().toString(36)`", () => {
    const diags = runRule(rule, "const id = Math.random().toString(36);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-math-random-for-id");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Security");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.message).toContain("CWE-330");
  });

  it("flags `Math.random().toString(16)`", () => {
    expect(
      runRule(rule, "const id = Math.random().toString(16);\n"),
    ).toHaveLength(1);
  });

  it("flags `Math.random().toString(36).slice(2)` (the chain head)", () => {
    // The `.slice(2)` part is outside the detector; we still flag the inner
    // `Math.random().toString(36)` call (one diagnostic, not two).
    expect(
      runRule(rule, "const id = Math.random().toString(36).slice(2);\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag `Math.random()` standing alone (legitimate uses)", () => {
    expect(
      runRule(
        rule,
        "function jitter(): number {\n  return Math.random() * 100;\n}\n",
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag `Math.random().toString()` with no base arg", () => {
    expect(runRule(rule, "const s = Math.random().toString();\n")).toHaveLength(
      0,
    );
  });

  it("does NOT flag `Math.random().toString(10)` (base 10 is a plain number, not the ID idiom)", () => {
    expect(
      runRule(rule, "const s = Math.random().toString(10);\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag `Math.random().toString(2)`", () => {
    expect(runRule(rule, "const s = Math.random().toString(2);\n")).toHaveLength(
      0,
    );
  });

  it("does NOT flag `(123).toString(36)` (toString on a non-`Math.random()` target)", () => {
    expect(runRule(rule, "const s = (123).toString(36);\n")).toHaveLength(0);
  });

  it("does NOT flag `Math.floor(...).toString(36)` (different Math API)", () => {
    expect(
      runRule(rule, "const s = Math.floor(1.5).toString(36);\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a method named `random` on a different namespace", () => {
    expect(
      runRule(
        rule,
        "declare const lib: { random(): number };\nconst s = lib.random().toString(36);\n",
      ),
    ).toHaveLength(0);
  });

  it("flags the bracket-notation form `Math['random']().toString(36)`", () => {
    // Minifier / codegen output sometimes lowers dotted access to bracket form;
    // the underlying CWE-330 problem is identical.
    expect(
      runRule(rule, "const id = Math['random']().toString(36);\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag bracket-notation on a different namespace", () => {
    expect(
      runRule(
        rule,
        "declare const lib: { random(): number };\nconst s = lib['random']().toString(36);\n",
      ),
    ).toHaveLength(0);
  });

  it("emits the expected help line pointing at crypto.randomUUID / randomBytes", () => {
    const diags = runRule(rule, "const id = Math.random().toString(36);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.help).toContain("crypto.randomUUID()");
    expect(diags[0]!.help).toContain("crypto.randomBytes");
  });
});
