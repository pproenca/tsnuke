import { describe, expect, it } from "vitest";
import { rule } from "./prefer-error-instantiation.js";
import { runRule } from "../../test-utils.js";

describe("prefer-error-instantiation (SYN)", () => {
  it("flags `throw Error('x')` (missing `new`)", () => {
    const diags = runRule(rule, "function f() { throw Error('x'); }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-error-instantiation");
  });

  it("flags a `*Error` subclass called without `new`", () => {
    expect(
      runRule(rule, "function f() { throw TypeError('bad'); }\n"),
    ).toHaveLength(1);
  });

  it("allows `throw new Error('x')`", () => {
    expect(
      runRule(rule, "function f() { throw new Error('x'); }\n"),
    ).toHaveLength(0);
  });

  it("does not flag an unrelated function call", () => {
    expect(
      runRule(rule, "function format(s: string) { return s; }\nconst x = format('a');\n"),
    ).toHaveLength(0);
  });

  it("does not flag a short name merely containing 'Error'", () => {
    // `Error` itself fires, but a 5-char non-`Error` name like `Erro` should not.
    expect(runRule(rule, "function Erro() {}\nconst x = Erro();\n")).toHaveLength(0);
  });
});
