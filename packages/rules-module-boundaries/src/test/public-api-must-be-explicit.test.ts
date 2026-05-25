import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/public-api-must-be-explicit.js";

describe("public-api-must-be-explicit (SYN)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a wildcard re-export", () => {
    const diags = runRule(rule, 'export * from "./mod";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("public-api-must-be-explicit");
  });

  it("allows explicit named re-exports", () => {
    expect(runRule(rule, 'export { a, b } from "./mod";\n')).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/position)", () => {
    const diags = runRule(rule, 'export * from "./mod";\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("public-api-must-be-explicit");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Module Boundaries & Architecture");
    expect(d.plugin).toBe("ts-fix");
    expect(d.message).toBe(
      "`export *` makes the public API implicit and defeats tree-shaking.",
    );
    expect(d.help).toBe(
      'Re-export named symbols explicitly (`export { a, b } from "…"`).',
    );
    // Position pins to the `ExportDeclaration` node start on line 1, col 1 (1-based).
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: a namespace re-export (`export * as ns`) has an exportClause → NOT fire ---

  it("does NOT fire on a namespaced wildcard re-export (`export * as ns`)", () => {
    // `export * as ns from "..."` carries a `NamespaceExport` exportClause, so it is
    // NOT the implicit `export * from "..."` form — must not fire.
    expect(runRule(rule, 'export * as ns from "./mod";\n')).toHaveLength(0);
  });

  // --- Added: a local export with no module specifier → NOT fire ---

  it("does NOT fire on a local named export with no module specifier", () => {
    expect(runRule(rule, "const a = 1;\nexport { a };\n")).toHaveLength(0);
  });

  // --- Added: a plain non-export statement → NOT fire ---

  it("does NOT fire on a plain import declaration", () => {
    expect(runRule(rule, 'import { x } from "./mod";\n')).toHaveLength(0);
  });
});
