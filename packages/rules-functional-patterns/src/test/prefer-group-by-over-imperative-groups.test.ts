import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-group-by-over-imperative-groups.js";

describe("prefer-group-by-over-imperative-groups (SYN)", () => {
  it("flags the canonical 2-statement groupBy loop", () => {
    const code = `
const groups: Record<string, Order[]> = {};
for (const o of orders) {
  if (!groups[o.customerId]) groups[o.customerId] = [];
  groups[o.customerId].push(o);
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-group-by-over-imperative-groups");
    expect(diags[0]!.message).toContain("groups");
  });

  it("flags the `groups[k]!.push(...)` variant (non-null assertion on receiver)", () => {
    const code = `
const groups: Record<string, X[]> = {};
for (const x of xs) {
  if (!groups[x.k]) groups[x.k] = [];
  groups[x.k]!.push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags the `=== undefined` variant", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) {
  if (g[x.k] === undefined) g[x.k] = [];
  g[x.k].push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags the `== null` variant (L4: loose-equality nullish check)", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) {
  if (g[x.k] == null) g[x.k] = [];
  g[x.k].push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags the `=== null` variant (L4: strict-equality null check)", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) {
  if (g[x.k] === null) g[x.k] = [];
  g[x.k].push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags the `!(k in X)` variant (L4: `in`-operator key-existence)", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) {
  if (!(x.k in g)) g[x.k] = [];
  g[x.k].push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a 1-statement body (handled by prefer-array-methods)", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) (g[x.k] ??= []).push(x);
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a 3-statement body (might have side effects)", () => {
    const code = `
const g: Record<string, X[]> = {};
for (const x of xs) {
  if (!g[x.k]) g[x.k] = [];
  g[x.k].push(x);
  console.log(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag when target / key don't match between statements", () => {
    const code = `
const a: Record<string, X[]> = {};
const b: Record<string, X[]> = {};
for (const x of xs) {
  if (!a[x.k]) a[x.k] = [];
  b[x.k].push(x);
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
