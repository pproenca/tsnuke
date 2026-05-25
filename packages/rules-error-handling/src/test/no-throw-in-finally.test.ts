import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-throw-in-finally.js";

describe("no-throw-in-finally (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags a throw in a finally block", () => {
    const diags = runRule(rule, 'try { f(); } finally { throw new Error("x"); }\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-throw-in-finally");
  });

  it("flags a return in a finally block", () => {
    const diags = runRule(
      rule,
      "function g() { try { f(); } finally { return 1; } }\n",
    );
    expect(diags).toHaveLength(1);
  });

  it("allows plain cleanup in a finally block", () => {
    expect(runRule(rule, "try { f(); } finally { cleanup(); }\n")).toHaveLength(0);
  });

  it("ignores a throw inside a nested function declared in finally", () => {
    expect(
      runRule(
        rule,
        'try { f(); } finally { const h = () => { throw new Error("inner"); }; }\n',
      ),
    ).toHaveLength(0);
  });

  // --- Added edge cases (message/severity/position + nested scopes) ---

  it("carries the verbatim message/help + meta in the diagnostic", () => {
    const diags = runRule(rule, 'try { f(); } finally { throw new Error("x"); }\n');
    expect(diags[0]!.message).toBe(
      "A `throw`/`return` in `finally` masks the original error/return.",
    );
    expect(diags[0]!.help).toBe(
      "Move the throw/return out of `finally`; let the original exception or return value propagate.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("reports the diagnostic at the offending throw statement", () => {
    // `throw` begins at 0-based char 23 ⇒ 1-based column 24.
    const diags = runRule(rule, 'try { f(); } finally { throw new Error("x"); }\n');
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(24);
  });

  it("flags a throw nested in a block/if inside finally", () => {
    expect(
      runRule(rule, 'try { f(); } finally { if (x) { throw new Error("x"); } }\n'),
    ).toHaveLength(1);
  });

  it("does NOT flag a throw in the try or catch block", () => {
    expect(
      runRule(
        rule,
        'try { throw new Error("a"); } catch (e) { throw e; } finally { cleanup(); }\n',
      ),
    ).toHaveLength(0);
  });

  it("ignores a return inside a nested function declared in finally", () => {
    expect(
      runRule(
        rule,
        "try { f(); } finally { const h = function () { return 1; }; }\n",
      ),
    ).toHaveLength(0);
  });
});
