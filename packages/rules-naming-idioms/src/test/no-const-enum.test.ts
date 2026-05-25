import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-const-enum.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-const-enum.test.ts`.
describe("no-const-enum (SYN)", () => {
  it("flags a `const enum`", () => {
    const diags = runRule(rule, "const enum Color { Red, Green }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-const-enum");
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag a plain `enum`", () => {
    expect(runRule(rule, "enum Color { Red, Green }\n")).toHaveLength(0);
  });

  it("does not flag a `const` variable declaration", () => {
    expect(runRule(rule, "const x = 1;\n")).toHaveLength(0);
  });

  // RULE-026 (broken auto-fix): declares fixKind:"auto-fix" but attaches NO fix
  // payload. Preserve verbatim — the diagnostic fires, but carries no `fix`.
  it("declares fixKind auto-fix but emits NO fix payload (RULE-026)", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const diags = runRule(rule, "const enum Color { Red, Green }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.fix).toBeUndefined();
  });
});
