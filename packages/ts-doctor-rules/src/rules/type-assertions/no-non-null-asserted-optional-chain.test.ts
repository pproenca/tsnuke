import { describe, expect, it } from "vitest";
import { runRule } from "../../test-utils.js";
import { rule } from "./no-non-null-asserted-optional-chain.js";

describe("SYN rule — no-non-null-asserted-optional-chain", () => {
  it("flags `!` applied to an optional-chain result (BC-10: tier SYN)", () => {
    const code = "declare const a: { b?: number } | null;\nconst x = a?.b!;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-non-null-asserted-optional-chain");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("error");
  });

  it("does not flag plain member access without an optional chain", () => {
    const code = "declare const a: { b: number };\nconst x = a.b;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
