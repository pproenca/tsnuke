import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/require-await.js";

describe("require-await (SYN) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

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

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (rule/tier/severity/category/plugin/message/help)", () => {
    const diags = runRule(rule, "async function f() { return 1; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("require-await");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe("`async` function has no `await` expression.");
    expect(d.help).toBe(
      "Remove `async`, or add the `await` this function was meant to use.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: every async function-like form is checked ---

  it("flags an async arrow function with no await", () => {
    expect(runRule(rule, "const f = async () => { return 1; };\n")).toHaveLength(1);
  });

  it("flags an async function expression with no await", () => {
    expect(
      runRule(rule, "const f = async function () { return 1; };\n"),
    ).toHaveLength(1);
  });

  it("flags an async method with no await", () => {
    expect(
      runRule(rule, "class C { async m() { return 1; } }\n"),
    ).toHaveLength(1);
  });

  // --- Added: `for await` counts as an await in the body ---

  it("does not flag an async function whose only await is a `for await`", () => {
    const code =
      "async function f(xs: AsyncIterable<number>) { for await (const x of xs) { console.log(x); } }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
