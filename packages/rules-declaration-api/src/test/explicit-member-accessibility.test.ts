import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/explicit-member-accessibility.js";

describe("explicit-member-accessibility (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags a class property with no access modifier", () => {
    expect(runRule(rule, "class C { x = 1; }\n")).toHaveLength(1);
  });

  it("flags a class method with no access modifier", () => {
    expect(runRule(rule, "class C { foo() {} }\n")).toHaveLength(1);
  });

  it("does NOT flag members with an explicit modifier", () => {
    expect(
      runRule(rule, "class C { private x = 1; public foo() {} protected bar() {} }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag object-literal methods (can't take modifiers)", () => {
    expect(runRule(rule, "const o = { foo() {} };\n")).toHaveLength(0);
  });

  // --- Added edge cases the rule's logic implies ---

  it("carries the rule id + warning severity + category in the diagnostic", () => {
    const diags = runRule(rule, "class C { x = 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("explicit-member-accessibility");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Declaration & API Hygiene");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.plugin).toBe("tsnuke");
  });

  it("uses the member name in the message when it is an identifier", () => {
    const diags = runRule(rule, "class C { x = 1; }\n");
    expect(diags[0]!.message).toBe(
      "Class `x` has no access modifier; declare `public`/`private`/`protected`.",
    );
    expect(diags[0]!.help).toBe(
      "Add an explicit accessibility modifier so the public surface is intentional.",
    );
  });

  it("reports 1-based line/column at the member start", () => {
    // `class C { x = 1; }` — `x` is at 0-based char 10, so 1-based column 11.
    const diags = runRule(rule, "class C { x = 1; }\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(11);
  });

  it("flags a get accessor with no modifier", () => {
    const diags = runRule(rule, "class C { get v() { return 1; } }\n");
    expect(diags).toHaveLength(1);
  });

  it("flags a set accessor with no modifier", () => {
    const diags = runRule(rule, "class C { set v(n: number) {} }\n");
    expect(diags).toHaveLength(1);
  });

  it("does NOT flag a private get accessor", () => {
    expect(
      runRule(rule, "class C { private get v() { return 1; } }\n"),
    ).toHaveLength(0);
  });

  it("flags each unmodified member independently", () => {
    const diags = runRule(rule, "class C { a = 1; b() {} get c() { return 1; } }\n");
    expect(diags).toHaveLength(3);
  });

  it("flags members of a class EXPRESSION too", () => {
    const diags = runRule(rule, "const C = class { x = 1; };\n");
    expect(diags).toHaveLength(1);
  });

  it("does NOT flag a constructor parameter (not a covered member kind)", () => {
    // Constructor itself is a MethodDeclaration-adjacent kind not in the visitor
    // map (Constructor); parameter properties also are not covered here.
    expect(runRule(rule, "class C { constructor(public n: number) {} }\n")).toHaveLength(
      0,
    );
  });

  it("emits nothing for a class with only modified members", () => {
    expect(
      runRule(rule, "class C { public a = 1; private b() {} }\n"),
    ).toHaveLength(0);
  });
});
