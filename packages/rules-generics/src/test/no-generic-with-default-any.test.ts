import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-generic-with-default-any.js";

describe("SYN rule — no-generic-with-default-any", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags `<T = any>` default", () => {
    const diags = runRule(rule, "function f<T = any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-generic-with-default-any");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("does not flag a non-any default like `<T = unknown>`", () => {
    expect(
      runRule(rule, "function f<T = unknown>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/help/position)", () => {
    const diags = runRule(rule, "function f<T = any>(x: T) { return x; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-generic-with-default-any");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Generics & Type-Level Complexity");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe("Type-parameter `T` defaults to `any`.");
    expect(d.help).toBe(
      "A type-parameter default of `any` silently disables checking when callers omit the type argument; default to `unknown` or a real type.",
    );
    // Position pins to the type parameter `T` on line 1, col 12 (1-based: `function f<` = 11 chars, `T` follows).
    expect(d.line).toBe(1);
    expect(d.column).toBe(12);
  });

  // --- Added boundary cases: no default, real-type default, multiple params ---

  it("does NOT flag a bare type parameter with no default", () => {
    expect(
      runRule(rule, "function f<T>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a real-type default like `<T = string>`", () => {
    expect(
      runRule(rule, "function f<T = string>(x: T) { return x; }\n"),
    ).toHaveLength(0);
  });

  it("flags only the `= any` parameter when mixed with a non-any default", () => {
    const diags = runRule(
      rule,
      "function f<T = unknown, U = any>(x: T, y: U) { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe("Type-parameter `U` defaults to `any`.");
  });

  it("flags `<T = any>` on an interface and type-alias declaration too", () => {
    expect(runRule(rule, "interface I<T = any> { x: T; }\n")).toHaveLength(1);
    expect(runRule(rule, "type Box<T = any> = { v: T };\n")).toHaveLength(1);
  });
});
