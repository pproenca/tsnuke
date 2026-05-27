import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/prefer-generator-over-iterator-class.js";

describe("prefer-generator-over-iterator-class (SYN)", () => {
  it("flags a class with both next() and [Symbol.iterator]()", () => {
    const code = `
class Range {
  constructor(private from: number, private to: number) {}
  next() { return { value: this.from++, done: this.from > this.to }; }
  [Symbol.iterator]() { return this; }
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-generator-over-iterator-class");
    expect(diags[0]!.message).toContain("Range");
  });

  it("does NOT flag a class with only next()", () => {
    const code = `
class Cursor {
  next() { return null; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a class with only [Symbol.iterator]()", () => {
    const code = `
class Wrapper {
  [Symbol.iterator]() { return [].values(); }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag `static next()` + instance [Symbol.iterator]() (C4: not a hand-rolled iterator)", () => {
    const code = `
class A {
  static next(): A { return new A(); }
  [Symbol.iterator]() { return [].values(); }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a class with [Symbol.asyncIterator]() (different protocol)", () => {
    const code = `
class A {
  next() { return Promise.resolve({ value: 0, done: true }); }
  [Symbol.asyncIterator]() { return this; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
