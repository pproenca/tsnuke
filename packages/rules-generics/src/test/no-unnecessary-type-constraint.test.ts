import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unnecessary-type-constraint.js";

describe("SYN rule — no-unnecessary-type-constraint", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags `<T extends any>` as a no-op constraint", () => {
    const diags = runRule(rule, "function f<T extends any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-unnecessary-type-constraint");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("flags `<T extends unknown>` as a no-op constraint", () => {
    const diags = runRule(
      rule,
      "function f<T extends unknown>(x: T) { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("unknown");
  });

  it("does not flag a real constraint", () => {
    expect(
      runRule(rule, "function f<T extends string>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape (both keywords) ---

  it("reports the full diagnostic for `extends any` (message/help/position)", () => {
    const diags = runRule(rule, "function f<T extends any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-unnecessary-type-constraint");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Generics & Type-Level Complexity");
    expect(d.plugin).toBe("ts-fix");
    expect(d.message).toBe(
      "Unnecessary type constraint: `extends any` is a no-op.",
    );
    expect(d.help).toBe(
      "`<T extends any>` permits every type, identical to a bare `<T>`. Drop the constraint or replace it with a real bound.",
    );
    // Position pins to the type parameter `T` on line 1, col 12 (1-based: `function f<` = 11 chars, `T` follows).
    expect(d.line).toBe(1);
    expect(d.column).toBe(12);
  });

  it("reports the full diagnostic for `extends unknown` (message keyword swap)", () => {
    const diags = runRule(
      rule,
      "function f<T extends unknown>(x: T) { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.message).toBe(
      "Unnecessary type constraint: `extends unknown` is a no-op.",
    );
    expect(d.help).toBe(
      "`<T extends unknown>` permits every type, identical to a bare `<T>`. Drop the constraint or replace it with a real bound.",
    );
  });

  // --- Added boundary cases: no constraint, other-keyword constraints ---

  it("does NOT flag a bare type parameter with no constraint", () => {
    expect(
      runRule(rule, "function f<T>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a non-any/unknown keyword constraint like `extends number`", () => {
    expect(
      runRule(rule, "function f<T extends number>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  it("flags the no-op constraint on an interface and type-alias declaration too", () => {
    expect(
      runRule(rule, "interface I<T extends any> { x: T; }\n"),
    ).toHaveLength(1);
    expect(
      runRule(rule, "type Box<T extends unknown> = { v: T };\n"),
    ).toHaveLength(1);
  });
});
