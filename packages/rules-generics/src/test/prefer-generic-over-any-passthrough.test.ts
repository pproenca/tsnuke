import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-generic-over-any-passthrough.js";

describe("prefer-generic-over-any-passthrough (TYP)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags an identity passthrough `(x: any): any`", () => {
    const diags = runTypeAwareRule(rule, "function id(x: any): any { return x; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("flags an arrow with an inferred `any` return", () => {
    expect(runTypeAwareRule(rule, "const wrap = (x: any) => x;\n")).toHaveLength(1);
  });

  it("flags a derivation that returns from the any param", () => {
    expect(
      runTypeAwareRule(rule, "function pick(o: any): any { return o.value; }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag an already-generic function", () => {
    expect(
      runTypeAwareRule(rule, "function id2<T>(x: T): T { return x; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag an `any` param with a non-any return", () => {
    expect(
      runTypeAwareRule(rule, "function log(x: any): void { console.log(x); }\n"),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (gated)", () => {
    expect(runRule(rule, "function id(x: any): any { return x; }\n")).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/help/position)", () => {
    const diags = runTypeAwareRule(rule, "function id(x: any): any { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("prefer-generic-over-any-passthrough");
    expect(d.tier).toBe("TYP");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Generics & Type-Level Complexity");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe(
      "`any` parameter flows to an `any` return, erasing the caller's type. Use a generic type parameter to preserve it.",
    );
    expect(d.help).toBe(
      "Replace `(x: any): any` with `<T>(x: T): T` (or the appropriate relationship) so the input type carries through to the output.",
    );
    // Position pins to the function declaration start: line 1, col 1.
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added boundary/scoping cases ---

  it("does NOT flag when the `any` param is not referenced by the return (no passthrough)", () => {
    // Return value is a fresh literal, not derived from the `any` param `x`.
    expect(
      runTypeAwareRule(rule, "function f(x: any): any { return 1; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a function with no `any` parameters", () => {
    expect(
      runTypeAwareRule(rule, "function f(x: string): any { return x; }\n"),
    ).toHaveLength(0);
  });

  it("flags an `any` passthrough method too", () => {
    expect(
      runTypeAwareRule(
        rule,
        "class C { m(x: any): any { return x; } }\n",
      ),
    ).toHaveLength(1);
  });

  it("does NOT flag a return from a nested function (nested returns are not the outer fn's)", () => {
    // The `return x` belongs to the nested arrow, not `f`; `f` itself returns the
    // nested fn, which does not reference the `any` param `x` directly.
    expect(
      runTypeAwareRule(
        rule,
        "function f(x: any): any { return () => 1; }\n",
      ),
    ).toHaveLength(0);
  });
});
