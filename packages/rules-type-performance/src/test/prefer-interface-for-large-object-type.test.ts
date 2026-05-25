import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-interface-for-large-object-type.js";

// 13 members — over LARGE_OBJECT_TYPE_MEMBERS = 12. (Legacy vector.)
const LARGE_OBJECT_TYPE =
  "type T = {\n  a: number;\n  b: number;\n  c: number;\n  d: number;\n  e: number;\n  f: number;\n  g: number;\n  h: number;\n  i: number;\n  j: number;\n  k: number;\n  l: number;\n  m: number;\n};\n";

// 12 members — at the boundary, allowed (`>` is exclusive). (Legacy vector.)
const BOUNDARY_OBJECT_TYPE =
  "type T = {\n  a: number;\n  b: number;\n  c: number;\n  d: number;\n  e: number;\n  f: number;\n  g: number;\n  h: number;\n  i: number;\n  j: number;\n  k: number;\n  l: number;\n};\n";

describe("prefer-interface-for-large-object-type (SYN) — RULE-010", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags an object type alias with more than 12 members", () => {
    const diags = runRule(rule, LARGE_OBJECT_TYPE);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-interface-for-large-object-type");
  });

  it("allows an object type alias at or under 12 members", () => {
    expect(runRule(rule, BOUNDARY_OBJECT_TYPE)).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/position)", () => {
    const diags = runRule(rule, LARGE_OBJECT_TYPE);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("prefer-interface-for-large-object-type");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Type Performance");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe(
      "Large object type alias `T` (13 members); prefer an `interface`.",
    );
    expect(d.help).toBe(
      "Large object type aliases re-instantiate on every use; an `interface` is cached by the compiler.",
    );
    // Position pins to the alias NAME `T` on line 1, col 6 (1-based: `type ` = 5 chars).
    expect(d.line).toBe(1);
    expect(d.column).toBe(6);
  });

  // --- Added boundary cases: exactly-at vs one-over ---

  it("does NOT fire at exactly 12 members (threshold is exclusive `>`)", () => {
    const exactly12 = `type T = { ${Array.from(
      { length: 12 },
      (_, i) => `m${i}: number`,
    ).join("; ")} };\n`;
    expect(runRule(rule, exactly12)).toHaveLength(0);
  });

  it("fires at 13 members (one over the threshold)", () => {
    const thirteen = `type T = { ${Array.from(
      { length: 13 },
      (_, i) => `m${i}: number`,
    ).join("; ")} };\n`;
    const diags = runRule(rule, thirteen);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Large object type alias `T` (13 members); prefer an `interface`.",
    );
  });

  // --- Added scoping case: only DIRECT object-literal aliases (RULE-010 edge) ---

  it("does NOT fire on an interface (only `type` aliases are inspected)", () => {
    const iface = `interface T { ${Array.from(
      { length: 13 },
      (_, i) => `m${i}: number`,
    ).join("; ")} }\n`;
    expect(runRule(rule, iface)).toHaveLength(0);
  });

  it("does NOT fire when the alias RHS is an intersection, not a direct object literal", () => {
    // `node.type` is an IntersectionTypeNode, not a TypeLiteralNode — skipped per RULE-010.
    const intersection = `type T = { ${Array.from(
      { length: 7 },
      (_, i) => `m${i}: number`,
    ).join("; ")} } & { ${Array.from(
      { length: 7 },
      (_, i) => `n${i}: number`,
    ).join("; ")} };\n`;
    expect(runRule(rule, intersection)).toHaveLength(0);
  });
});
