import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-flatmap-over-reduce-concat.js";

describe("prefer-flatmap-over-reduce-concat (SYN)", () => {
  it("flags the canonical expression-bodied reduce-concat", () => {
    const code = `const out = xs.reduce((acc, x) => acc.concat(f(x)), []);\n`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-flatmap-over-reduce-concat");
    expect(diags[0]!.message).toContain("flatMap");
  });

  it("flags the block-bodied form", () => {
    const code = `const out = xs.reduce((acc, x) => { return acc.concat(f(x)); }, []);\n`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a reduce with non-empty initial value", () => {
    const code = `const out = xs.reduce((acc, x) => acc.concat(f(x)), [0]);\n`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a reduce whose body does not call concat", () => {
    const code = `const out = xs.reduce((acc, x) => acc + x, 0);\n`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a reduce whose concat is on something other than acc", () => {
    const code = `const out = xs.reduce((acc, x) => other.concat(x), []);\n`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag .reduce calls with non-arrow first arg", () => {
    const code = `const out = xs.reduce(combine, []);\n`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
