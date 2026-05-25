import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-unnecessary-instanceof.js";

// Ported VERBATIM from legacy `.../type-safety/no-unnecessary-instanceof.test.ts`.
// TYP rule: positive cases run through `runTypeAwareRule` (live checker); the gated
// path runs through `runRule` (no checker → early return).
describe("no-unnecessary-instanceof (TYP)", () => {
  it("flags an always-true instanceof (value is already that class)", () => {
    const diags = runTypeAwareRule(
      rule,
      "class Foo {}\ndeclare const x: Foo;\nfunction f() { return x instanceof Foo; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-instanceof");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("always true");
  });

  it("does NOT flag a legitimate guard over a union", () => {
    expect(
      runTypeAwareRule(
        rule,
        "class Foo {}\nclass Bar {}\ndeclare const x: Foo | Bar;\nfunction f() { return x instanceof Foo; }\n",
      ),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (gated)", () => {
    expect(
      runRule(rule, "class Foo {}\ndeclare const x: Foo;\nconst b = x instanceof Foo;\n"),
    ).toHaveLength(0);
  });

  // Negative: a subclass-narrowing guard is left alone (not the same class).
  it("does NOT flag a guard that narrows a subclass union", () => {
    expect(
      runTypeAwareRule(
        rule,
        "class Animal {}\nclass Dog extends Animal {}\ndeclare const a: Animal;\nfunction f() { return a instanceof Dog; }\n",
      ),
    ).toHaveLength(0);
  });
});
