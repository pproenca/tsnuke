import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-reduce-over-imperative-sum.js";

describe("prefer-reduce-over-imperative-sum (SYN)", () => {
  it("flags a for-of summing into a let accumulator", () => {
    const code = `
let total = 0;
for (const x of xs) total += x.amount;
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-reduce-over-imperative-sum");
    expect(diags[0]!.message).toContain("total");
  });

  it("flags a for-of with a 1-statement block body", () => {
    const code = `
let n = 0;
for (const x of xs) { n += 1; }
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `-=` and `*=` accumulators", () => {
    expect(runRule(rule, "let n = 1;\nfor (const x of xs) n -= 1;\n")).toHaveLength(1);
    expect(runRule(rule, "let n = 1;\nfor (const x of xs) n *= 2;\n")).toHaveLength(1);
  });

  it("flags a classic `for (let i; …)` accumulator loop", () => {
    const code = `
let total = 0;
for (let i = 0; i < xs.length; i++) total += xs[i];
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a `for await (...)` loop (C2: reduce can't drain async iterables)", () => {
    const code = `
async function f(xs: AsyncIterable<number>) {
  let total = 0;
  for await (const x of xs) total += x;
  return total;
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a multi-statement body (might be side-effecting)", () => {
    const code = `
let total = 0;
for (const x of xs) {
  total += x;
  console.log(total);
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag `acc[k] += x` (groupBy/histogram family)", () => {
    const code = `
const counts: Record<string, number> = {};
for (const x of xs) counts[x.k] += 1;
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag logical/nullish compound assignments", () => {
    expect(runRule(rule, "let ok = true;\nfor (const x of xs) ok ||= x;\n")).toHaveLength(0);
    expect(runRule(rule, "let v = null;\nfor (const x of xs) v ??= x;\n")).toHaveLength(0);
  });
});
