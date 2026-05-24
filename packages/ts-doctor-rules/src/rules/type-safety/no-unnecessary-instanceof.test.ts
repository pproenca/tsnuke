import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-instanceof.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unnecessary-instanceof (TYP)", () => {
  it("flags an always-true instanceof (value is already that class)", () => {
    const diags = runTypeAwareRule(
      rule,
      "class Foo {}\ndeclare const x: Foo;\nfunction f() { return x instanceof Foo; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
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
});
