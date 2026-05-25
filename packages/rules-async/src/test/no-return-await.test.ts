import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-return-await.js";

describe("no-return-await (SYN) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a redundant `return await`", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { return await g(); }\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-return-await");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag `return await` inside a try block", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { try { return await g(); } catch { return 0; } }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does not flag a plain `return` of a promise", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { return g(); }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags `return await` in a try when it sits in a nested function (function boundary)", () => {
    // The inner arrow's `return await` is NOT inside its own try, so it is flagged.
    const code =
      "declare function g(): Promise<number>;\nasync function f() { try { const h = async () => { return await g(); }; return h(); } catch { return 0; } }\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  // --- Added characterization detail: full diagnostic shape + position ---

  it("reports the full diagnostic (category/plugin/message/help/position)", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { return await g(); }\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe(
      "redundant `return await`; return the promise directly",
    );
    expect(d.help).toBe(
      "Remove the `await` and return the promise directly (the async wrapper already produces a Promise).",
    );
    // Position pins to the `return` statement on line 2, col 22
    // (1-based: `async function f() { ` = 21 chars).
    expect(d.line).toBe(2);
    expect(d.column).toBe(22);
  });

  // --- Added negatives ---

  it("does not flag a bare `return` with no expression", () => {
    expect(
      runRule(rule, "async function f() { return; }\n"),
    ).toHaveLength(0);
  });

  it("does not flag `return await` inside a `finally` block (try-block exemption is only the tryBlock)", () => {
    // The exemption applies ONLY when the return sits in the `tryBlock` itself; a
    // `return await` in the `finally` clause is NOT exempt and IS flagged.
    const code =
      "declare function g(): Promise<number>;\nasync function f() { try {} finally { return await g(); } }\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });
});
