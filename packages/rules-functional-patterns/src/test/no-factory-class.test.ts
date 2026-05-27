import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-factory-class.js";

describe("no-factory-class (SYN)", () => {
  it("flags a class whose only method is create()", () => {
    const code = `
class WidgetFactory {
  create(): Widget { return { kind: "widget" }; }
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-factory-class");
    expect(diags[0]!.message).toContain("WidgetFactory");
    expect(diags[0]!.message).toContain("create");
  });

  it("flags a class whose only method is static create() (C1: the canonical TS factory shape)", () => {
    const code = `
class User {
  static create(name: string): User { return new User(); }
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("User");
  });

  it("flags a class whose only method is make() / build() / of() / from()", () => {
    expect(runRule(rule, "class A { make(): A { return new A(); } }")).toHaveLength(1);
    expect(runRule(rule, "class B { build(): B { return new B(); } }")).toHaveLength(1);
    expect(runRule(rule, "class C { of(x: number): C { return new C(); } }")).toHaveLength(1);
    expect(runRule(rule, "class D { from(x: string): D { return new D(); } }")).toHaveLength(1);
  });

  it("flags a Factory declared as a class expression (L1: `const F = class { create() {…} }`)", () => {
    const code = `const F = class { create() { return {}; } };\n`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a class with multiple instance methods", () => {
    const code = `
class XService {
  create(): X { return { kind: "x" }; }
  delete(id: string): void {}
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag an abstract class (handled by subclasses)", () => {
    const code = `
abstract class AbstractFactory {
  abstract create(): Product;
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a class whose only method has an unrelated name", () => {
    const code = `
class Calculator {
  compute(): number { return 42; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
