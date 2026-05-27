import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-mutable-builder-class.js";

describe("no-mutable-builder-class (SYN)", () => {
  it("flags a class with chained setters + build()", () => {
    const code = `
class PizzaBuilder {
  private _size: string = "M";
  private _toppings: string[] = [];
  size(s: string) { this._size = s; return this; }
  addTopping(t: string) { this._toppings.push(t); return this; }
  build() { return { size: this._size, toppings: this._toppings }; }
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-mutable-builder-class");
    expect(diags[0]!.message).toContain("PizzaBuilder");
    expect(diags[0]!.message).toContain("Builder");
  });

  it("flags a class with create() as the finisher", () => {
    const code = `
class QueryBuilder {
  from(t: string) { return this; }
  where(p: string) { return this; }
  create() { return "SELECT * FROM x"; }
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a class with only one `return this` method", () => {
    const code = `
class Single {
  step() { return this; }
  build() { return 1; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a class without a finisher", () => {
    const code = `
class Chain {
  a() { return this; }
  b() { return this; }
  c() { return this; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags a builder using arrow-property methods (L3: `size = (s) => { …; return this; }`)", () => {
    const code = `
class PB {
  private _s: string = "";
  private _t: string = "";
  size = (s: string) => { this._s = s; return this; };
  topping = (t: string) => { this._t = t; return this; };
  build = () => ({ size: this._s, topping: this._t });
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags a builder declared as a class expression (L1: `const PB = class { … }`)", () => {
    const code = `
const PB = class {
  size(s: string) { return this; }
  addTopping(t: string) { return this; }
  build() { return {}; }
};
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag plain non-builder classes", () => {
    const code = `
class Calculator {
  add(a: number, b: number): number { return a + b; }
  sub(a: number, b: number): number { return a - b; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
