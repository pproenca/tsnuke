import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/generic-name-convention.js";

describe("generic-name-convention (SYN)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a lowercase type parameter name", () => {
    const diags = runRule(rule, "function f<t>(x: t) { return x; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("generic-name-convention");
  });

  it("allows a PascalCase type parameter name", () => {
    expect(runRule(rule, "function f<T>(x: T) { return x; }\n")).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/help/position)", () => {
    const diags = runRule(rule, "function f<t>(x: t) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("generic-name-convention");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Generics & Type-Level Complexity");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe(
      "Type parameter names should be PascalCase, e.g. `T`, `TKey`, `TValue`.",
    );
    expect(d.help).toBe(
      "Rename type parameter `t` to start with an uppercase letter (PascalCase).",
    );
    // Position pins to the type parameter `t` on line 1, col 12 (1-based: `function f<` = 11 chars, `t` follows).
    expect(d.line).toBe(1);
    expect(d.column).toBe(12);
  });

  // --- Added boundary cases: case sensitivity + multi-param ---

  it("allows an uppercase-leading multi-letter name like `TKey`", () => {
    expect(
      runRule(rule, "function f<TKey>(x: TKey) { return x; }\n"),
    ).toHaveLength(0);
  });

  it("flags each lowercase type parameter independently", () => {
    const diags = runRule(rule, "function f<a, B, c>() {}\n");
    expect(diags).toHaveLength(2);
    expect(diags.map((d) => d.help)).toEqual([
      "Rename type parameter `a` to start with an uppercase letter (PascalCase).",
      "Rename type parameter `c` to start with an uppercase letter (PascalCase).",
    ]);
  });

  it("flags lowercase type parameters on an interface, class and type alias too", () => {
    expect(runRule(rule, "interface I<a> { x: a; }\n")).toHaveLength(1);
    expect(runRule(rule, "class C<a> { x!: a; }\n")).toHaveLength(1);
    expect(runRule(rule, "type T<a> = a[];\n")).toHaveLength(1);
  });
});
