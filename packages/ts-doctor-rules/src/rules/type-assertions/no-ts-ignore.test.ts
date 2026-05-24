import { describe, it, expect } from "vitest";
import { runRule } from "../../test-utils.js";
import { rule } from "./no-ts-ignore.js";

describe("SYN rule — no-ts-ignore", () => {
  it("flags a // @ts-ignore directive (BC-10: tier SYN)", () => {
    const code = ["// @ts-ignore", "const x: number = oops;", ""].join("\n");
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-ts-ignore");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.tier).toBe("SYN");
    expect(d.line).toBe(1);
  });

  it("does not flag @ts-expect-error", () => {
    const code = "// @ts-expect-error\nconst x: number = oops;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags every occurrence", () => {
    const code = "// @ts-ignore\nfoo();\n// @ts-ignore\nbar();\n";
    expect(runRule(rule, code)).toHaveLength(2);
  });
});
