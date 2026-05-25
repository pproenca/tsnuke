import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-await-in-loop.js";

describe("no-await-in-loop (SYN) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags an await inside a for-of loop", () => {
    const diags = runRule(
      rule,
      "async function f(xs: number[]) { for (const x of xs) { await Promise.resolve(x); } }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-await-in-loop");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag an await outside any loop", () => {
    expect(
      runRule(rule, "async function f() { await Promise.resolve(1); }\n"),
    ).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape + position ---

  it("reports the full diagnostic (category/plugin/message/help)", () => {
    const diags = runRule(
      rule,
      "async function f(xs: number[]) { for (const x of xs) { await Promise.resolve(x); } }\n",
    );
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe(
      "`await` in a loop serializes iterations; consider `Promise.all`.",
    );
    expect(d.help).toBe(
      "If the iterations are independent, build an array of promises and `await Promise.all(...)` after the loop.",
    );
    expect(d.line).toBe(1);
  });

  // --- Added: every loop kind fires ---

  it("flags an await inside a for loop", () => {
    expect(
      runRule(
        rule,
        "async function f() { for (let i = 0; i < 3; i++) { await Promise.resolve(i); } }\n",
      ),
    ).toHaveLength(1);
  });

  it("flags an await inside a for-in loop", () => {
    expect(
      runRule(
        rule,
        "async function f(o: Record<string, number>) { for (const k in o) { await Promise.resolve(k); } }\n",
      ),
    ).toHaveLength(1);
  });

  it("flags an await inside a while loop", () => {
    expect(
      runRule(
        rule,
        "async function f() { while (true) { await Promise.resolve(1); break; } }\n",
      ),
    ).toHaveLength(1);
  });

  it("flags an await inside a do-while loop", () => {
    expect(
      runRule(
        rule,
        "async function f() { do { await Promise.resolve(1); } while (false); }\n",
      ),
    ).toHaveLength(1);
  });

  // --- Added scoping case: a nested function boundary inside the loop stops the walk ---

  it("does NOT count an await inside a callback nested in the loop (function boundary)", () => {
    // The await lives inside an async arrow passed to `.forEach`, which is a function
    // boundary crossed before reaching the for-of loop — so it must NOT fire.
    const code =
      "async function f(xs: number[]) { for (const x of xs) { [x].forEach(async (y) => { await Promise.resolve(y); }); } }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
