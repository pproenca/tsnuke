import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-export-assignment.js";

describe("no-export-assignment (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags `export = …`", () => {
    const diags = runRule(rule, "export = 42;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-export-assignment");
  });

  it("allows `export default …`", () => {
    expect(runRule(rule, "export default 42;\n")).toHaveLength(0);
  });

  // --- Added edge cases the rule's logic implies ---

  it("carries the verbatim message/help + meta in the diagnostic", () => {
    const diags = runRule(rule, "export = 42;\n");
    expect(diags[0]!.message).toBe("`export =` is CommonJS-style.");
    expect(diags[0]!.help).toBe(
      "Prefer an ES module `export default` or named exports.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Declaration & API Hygiene");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("reports 1-based line/column at the export-assignment start", () => {
    const diags = runRule(rule, "export = 42;\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(1);
  });

  it("flags `export = identifier`", () => {
    const diags = runRule(rule, "const m = {};\nexport = m;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.line).toBe(2);
  });

  it("does NOT flag `export default` of an identifier", () => {
    expect(runRule(rule, "const m = {};\nexport default m;\n")).toHaveLength(0);
  });

  it("does NOT flag named exports", () => {
    expect(runRule(rule, "const m = 1;\nexport { m };\n")).toHaveLength(0);
  });
});
