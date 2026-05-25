import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-large-union-type.js";

// 13 string-literal members — over MAX_UNION_MEMBERS = 12. (Legacy vector.)
const LARGE_UNION =
  'type T =\n  | "a"\n  | "b"\n  | "c"\n  | "d"\n  | "e"\n  | "f"\n  | "g"\n  | "h"\n  | "i"\n  | "j"\n  | "k"\n  | "l"\n  | "m";\n';

// 12 members — at the boundary, allowed (`>` is exclusive). (Legacy vector.)
const BOUNDARY_UNION =
  'type T =\n  | "a"\n  | "b"\n  | "c"\n  | "d"\n  | "e"\n  | "f"\n  | "g"\n  | "h"\n  | "i"\n  | "j"\n  | "k"\n  | "l";\n';

describe("no-large-union-type (SYN) — RULE-008", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a union with more than 12 members", () => {
    const diags = runRule(rule, LARGE_UNION);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-large-union-type");
  });

  it("allows a union at or under 12 members", () => {
    expect(runRule(rule, BOUNDARY_UNION)).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/position)", () => {
    const diags = runRule(rule, LARGE_UNION);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-large-union-type");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Type Performance");
    expect(d.plugin).toBe("ts-fix");
    expect(d.message).toBe(
      "Very large union type `T` (13 members) slows type instantiation.",
    );
    expect(d.help).toBe(
      "Consider a different model than a wide union (e.g. a branded type or lookup record).",
    );
    // Position pins to the alias NAME `T` on line 1, col 6 (1-based: `type ` = 5 chars).
    expect(d.line).toBe(1);
    expect(d.column).toBe(6);
  });

  // --- Added boundary cases: exactly-at vs one-over ---

  it("does NOT fire at exactly 12 members (threshold is exclusive `>`)", () => {
    const exactly12 = `type T = ${Array.from(
      { length: 12 },
      (_, i) => `"${i}"`,
    ).join(" | ")};\n`;
    expect(runRule(rule, exactly12)).toHaveLength(0);
  });

  it("fires at 13 members (one over the threshold)", () => {
    const thirteen = `type T = ${Array.from(
      { length: 13 },
      (_, i) => `"${i}"`,
    ).join(" | ")};\n`;
    const diags = runRule(rule, thirteen);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Very large union type `T` (13 members) slows type instantiation.",
    );
  });

  // --- Added scoping case: only a direct union alias RHS counts (RULE-008 edge) ---

  it("does NOT fire on a wide union nested inside another construct (only direct alias RHS)", () => {
    // The 13-member union is the element type of an array, not the alias RHS itself,
    // so `node.type` is an ArrayTypeNode, not a UnionTypeNode — must NOT fire.
    const nested = `type T = (${Array.from(
      { length: 13 },
      (_, i) => `"${i}"`,
    ).join(" | ")})[];\n`;
    expect(runRule(rule, nested)).toHaveLength(0);
  });

  it("does NOT fire on a wide union used as a function parameter type (not an alias)", () => {
    const param = `function f(x: ${Array.from(
      { length: 13 },
      (_, i) => `"${i}"`,
    ).join(" | ")}) {}\n`;
    expect(runRule(rule, param)).toHaveLength(0);
  });
});
