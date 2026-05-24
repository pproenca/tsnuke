import { describe, expect, it } from "vitest";
import { rule } from "./no-async-promise-executor.js";
import { runRule } from "../../test-utils.js";

describe("no-async-promise-executor (SYN)", () => {
  it("flags an async Promise executor", () => {
    const diags = runRule(
      rule,
      "new Promise(async (resolve) => { resolve(1); });\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-async-promise-executor");
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.message).toContain("must not be `async`");
  });

  it("flags an async function-expression executor", () => {
    expect(
      runRule(rule, "new Promise(async function (resolve) { resolve(1); });\n"),
    ).toHaveLength(1);
  });

  it("does not flag a plain executor", () => {
    expect(runRule(rule, "new Promise((resolve) => resolve(1));\n")).toHaveLength(0);
  });

  it("does not flag a non-Promise new expression with an async arg", () => {
    expect(
      runRule(rule, "new Foo(async (resolve) => { resolve(1); });\n"),
    ).toHaveLength(0);
  });
});
