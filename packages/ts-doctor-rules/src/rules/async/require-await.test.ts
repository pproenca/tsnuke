import { describe, expect, it } from "vitest";
import { rule } from "./require-await.js";
import { runRule } from "../../test-utils.js";

describe("require-await (SYN)", () => {
  it("flags an async function with no await", () => {
    expect(runRule(rule, "async function f() { return 1; }\n")).toHaveLength(1);
  });

  it("does not flag an async function that awaits", () => {
    expect(
      runRule(rule, "async function g() { await Promise.resolve(1); }\n"),
    ).toHaveLength(0);
  });

  it("does not flag a non-async function", () => {
    expect(runRule(rule, "function h() { return 1; }\n")).toHaveLength(0);
  });

  it("does not count awaits inside a nested function scope", () => {
    const code =
      "async function f() { const g = async () => { await Promise.resolve(1); }; return g; }\n";
    // f itself never awaits → flagged; nested g awaits → not flagged. Total: 1.
    expect(runRule(rule, code)).toHaveLength(1);
  });
});
