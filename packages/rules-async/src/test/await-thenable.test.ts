import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/await-thenable.js";

describe("await-thenable (TYP / BC-10) — RULE-025 async", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags awaiting a non-Promise under a live checker", () => {
    const diags = runTypeAwareRule(rule, "async function f() { await 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("await-thenable");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag awaiting a real Promise", () => {
    const diags = runTypeAwareRule(
      rule,
      "async function f() { await Promise.resolve(1); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(runRule(rule, "async function f() { await 1; }\n")).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape + position ---

  it("reports the full diagnostic (category/plugin/message/help/position)", () => {
    const diags = runTypeAwareRule(rule, "async function f() { await 1; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.category).toBe("Async / Promises");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe("Awaiting a non-Promise is a no-op, likely a bug.");
    expect(d.help).toBe(
      "Remove the redundant `await`, or fix the operand to be a Promise.",
    );
    // Position pins to the `await` expression on line 1, col 22
    // (1-based: `async function f() { ` = 21 chars).
    expect(d.line).toBe(1);
    expect(d.column).toBe(22);
    // This rule carries NO fix payload (only no-floating-promises does).
    expect(d.fix).toBeUndefined();
  });

  // --- Added negatives: awaiting a thenable union / a custom thenable ---

  it("does not flag awaiting a `Promise<T> | T` union (a thenable constituent suffices)", () => {
    const code =
      "declare const p: Promise<number> | number;\nasync function f() { await p; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag awaiting a custom thenable (callable `then`)", () => {
    const code =
      "declare const t: { then(cb: (v: number) => void): void };\nasync function f() { await t; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("flags awaiting a plain object with no `then` member", () => {
    const code =
      "declare const o: { x: number };\nasync function f() { await o; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });
});
