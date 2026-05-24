import { describe, expect, it } from "vitest";
import { rule } from "./switch-exhaustiveness-check.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("switch-exhaustiveness-check (TYP / BC-10)", () => {
  it("flags a non-exhaustive switch over a literal union", () => {
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; case "g": break; }\n';
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("switch-exhaustiveness-check");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.message).toContain('"b"');
  });

  it("does not flag an exhaustive switch", () => {
    const code =
      'declare const c: "r" | "g";\nswitch (c) { case "r": break; case "g": break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag when a default branch is present", () => {
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; default: break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("ignores a switch over a non-literal discriminant (conservative)", () => {
    const code = "declare const n: number;\nswitch (n) { case 1: break; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "switch (1 as 1 | 2) { case 1: break; }\n"),
    ).toHaveLength(0);
  });
});
