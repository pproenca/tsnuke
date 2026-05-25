import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-async-promise-executor.js";

describe("no-async-promise-executor (SYN) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

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

  // --- Added characterization detail: full diagnostic shape + position ---

  it("reports the full diagnostic (tier/severity/category/plugin/message/help/position)", () => {
    const diags = runRule(
      rule,
      "new Promise(async (resolve) => { resolve(1); });\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-async-promise-executor");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("error");
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe(
      "a Promise executor must not be `async`: its rejections are swallowed",
    );
    expect(d.help).toBe(
      "Make the executor a plain function and call `resolve`/`reject`; do any async work outside or via `.then`/`await` on the constructed promise.",
    );
    // Position pins to the executor (the `async` arrow) on line 1, col 13
    // (1-based: `new Promise(` = 12 chars).
    expect(d.line).toBe(1);
    expect(d.column).toBe(13);
  });

  // --- Added negatives: a plain function-expression executor; no first arg ---

  it("does not flag a plain function-expression executor", () => {
    expect(
      runRule(rule, "new Promise(function (resolve) { resolve(1); });\n"),
    ).toHaveLength(0);
  });

  it("does not flag a Promise with no arguments", () => {
    expect(runRule(rule, "new Promise();\n")).toHaveLength(0);
  });

  it("does not flag a non-function first argument", () => {
    expect(runRule(rule, "new Promise(42);\n")).toHaveLength(0);
  });
});
