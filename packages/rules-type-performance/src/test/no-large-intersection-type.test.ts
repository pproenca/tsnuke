import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-large-intersection-type.js";

describe("SYN rule — no-large-intersection-type — RULE-009", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags an intersection with more than 5 members", () => {
    const diags = runRule(
      rule,
      "type T = { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 };\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-large-intersection-type");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });

  it("does not flag a small intersection", () => {
    expect(runRule(rule, "type T = { a: 1 } & { b: 2 };\n")).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (category/message/help/position)", () => {
    const diags = runRule(
      rule,
      "type T = { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 };\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Type Performance");
    expect(d.plugin).toBe("ts-fix");
    expect(d.message).toBe(
      "Large intersection type (6 members) is expensive to instantiate.",
    );
    expect(d.help).toBe(
      "Large intersection types are expensive to instantiate and hard to read; consider a single named type.",
    );
    // Position pins to the START of the intersection node (`{ a: 1 }`), col 10 (after `type T = `).
    expect(d.line).toBe(1);
    expect(d.column).toBe(10);
  });

  // --- Added boundary cases: exactly-at vs one-over ---

  it("does NOT fire at exactly 5 members (threshold is exclusive `>`)", () => {
    expect(
      runRule(rule, "type T = { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 };\n"),
    ).toHaveLength(0);
  });

  it("fires at 6 members (one over the threshold)", () => {
    const diags = runRule(
      rule,
      "type T = { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 };\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Large intersection type (6 members) is expensive to instantiate.",
    );
  });

  // --- Added scoping case: intersection ANYWHERE (not limited to aliases) (RULE-009 edge) ---

  it("fires on a 6-member intersection nested inside another construct (intersection anywhere)", () => {
    // The intersection is the element type of an array, NOT a direct alias RHS — but
    // RULE-009 fires on IntersectionTypeNode anywhere, so this still fires.
    const diags = runRule(
      rule,
      "type T = ({ a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 })[];\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-large-intersection-type");
  });

  it("fires on a 6-member intersection in a function parameter type (not an alias)", () => {
    const diags = runRule(
      rule,
      "function f(x: { a: 1 } & { b: 2 } & { c: 3 } & { d: 4 } & { e: 5 } & { f: 6 }) {}\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-large-intersection-type");
  });
});
