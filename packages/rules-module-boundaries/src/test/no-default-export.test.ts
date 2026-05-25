import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-default-export.js";

describe("no-default-export (SYN)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags `export default <expr>`", () => {
    const diags = runRule(rule, "export default 42;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-default-export");
  });

  it("flags `export default function`", () => {
    const diags = runRule(rule, "export default function f() {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-default-export");
  });

  it("allows a named export", () => {
    expect(runRule(rule, "export const x = 1;\n")).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape (expr form) ---

  it("reports the full diagnostic for `export default <expr>` (tier/severity/category/message/position)", () => {
    const diags = runRule(rule, "export default 42;\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-default-export");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Module Boundaries & Architecture");
    expect(d.plugin).toBe("ts-fix");
    expect(d.message).toBe("`export default` found; prefer a named export.");
    expect(d.help).toBe(
      "Replace the default export with a named export for better refactoring, discoverability, and tree-shaking.",
    );
    // Position pins to the `ExportAssignment` node start on line 1, col 1 (1-based).
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: the other default-declaration forms (modifier-based detection) ---

  it("flags `export default class`", () => {
    const diags = runRule(rule, "export default class C {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-default-export");
  });

  // --- Added: `export =` (export-equals) must NOT fire (it is not `export default`) ---

  it("does NOT fire on `export =` (export-equals, not a default export)", () => {
    expect(runRule(rule, "export = 42;\n")).toHaveLength(0);
  });

  // --- Added: a plain (non-default) exported function/class must NOT fire ---

  it("does NOT fire on a named exported function (no `default` modifier)", () => {
    expect(runRule(rule, "export function f() {}\n")).toHaveLength(0);
  });

  it("does NOT fire on a named exported class (no `default` modifier)", () => {
    expect(runRule(rule, "export class C {}\n")).toHaveLength(0);
  });

  // --- Added: a non-exported function/class must NOT fire ---

  it("does NOT fire on a non-exported function declaration", () => {
    expect(runRule(rule, "function f() {}\n")).toHaveLength(0);
  });
});
