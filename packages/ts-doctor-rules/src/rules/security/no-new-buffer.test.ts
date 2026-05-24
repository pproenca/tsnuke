import { describe, expect, it } from "vitest";
import { rule } from "./no-new-buffer.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — no-new-buffer", () => {
  it("flags `new Buffer(...)`", () => {
    const diags = runRule(rule, 'const b = new Buffer("x");\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-new-buffer");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("error");
  });

  it("does not flag `Buffer.from(...)`", () => {
    expect(runRule(rule, 'const b = Buffer.from("x");\n')).toHaveLength(0);
  });
});
