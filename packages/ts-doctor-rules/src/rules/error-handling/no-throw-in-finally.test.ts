import { describe, expect, it } from "vitest";
import { rule } from "./no-throw-in-finally.js";
import { runRule } from "../../test-utils.js";

describe("no-throw-in-finally (SYN)", () => {
  it("flags a throw in a finally block", () => {
    const diags = runRule(
      rule,
      'try { f(); } finally { throw new Error("x"); }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-throw-in-finally");
  });

  it("flags a return in a finally block", () => {
    const diags = runRule(rule, "function g() { try { f(); } finally { return 1; } }\n");
    expect(diags).toHaveLength(1);
  });

  it("allows plain cleanup in a finally block", () => {
    expect(runRule(rule, "try { f(); } finally { cleanup(); }\n")).toHaveLength(
      0,
    );
  });

  it("ignores a throw inside a nested function declared in finally", () => {
    expect(
      runRule(
        rule,
        'try { f(); } finally { const h = () => { throw new Error("inner"); }; }\n',
      ),
    ).toHaveLength(0);
  });
});
