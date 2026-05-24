import { describe, it, expect } from "vitest";
import { runRule } from "../../test-utils.js";
import { rule } from "./no-non-null-assertion.js";

describe("SYN rule — no-non-null-assertion", () => {
  it("flags a non-null assertion `expr!` (BC-10: tier SYN)", () => {
    const code = "declare const x: string | undefined;\nconst y = x!.length;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-non-null-assertion");
    expect(d.tier).toBe("SYN");
    expect(d.line).toBe(2);
  });

  it("does not flag plain member access", () => {
    const code = "declare const x: string;\nconst y = x.length;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
