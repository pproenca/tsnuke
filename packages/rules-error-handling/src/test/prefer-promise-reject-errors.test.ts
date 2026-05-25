import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/prefer-promise-reject-errors.js";

describe("prefer-promise-reject-errors (TYP)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags rejecting with a string primitive", () => {
    const diags = runTypeAwareRule(
      rule,
      'function f() { return Promise.reject("boom"); }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("does not flag rejecting with an Error", () => {
    expect(
      runTypeAwareRule(
        rule,
        'function f() { return Promise.reject(new Error("x")); }\n',
      ),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, 'function f() { return Promise.reject("boom"); }\n'),
    ).toHaveLength(0);
  });

  // --- Added edge cases (other primitives, negatives, message/rule-id) ---

  it("flags rejecting with a number primitive", () => {
    expect(
      runTypeAwareRule(rule, "function f() { return Promise.reject(42); }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a non-Promise `.reject(...)` call", () => {
    const code =
      "declare const queue: { reject(x: string): void };\n" +
      'function f() { queue.reject("boom"); }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag `Promise.reject()` with no argument", () => {
    expect(
      runTypeAwareRule(rule, "function f() { return Promise.reject(); }\n"),
    ).toHaveLength(0);
  });

  it("carries the verbatim message/help + meta + rule-id (severity=warning)", () => {
    const diags = runTypeAwareRule(
      rule,
      'function f() { return Promise.reject("boom"); }\n',
    );
    expect(diags[0]!.rule).toBe("prefer-promise-reject-errors");
    // The checker stringifies the literal type, not the widened `string` — the
    // message embeds `checker.typeToString(type)` verbatim from legacy.
    expect(diags[0]!.message).toBe(
      'reject with an Error, not a primitive ("boom").',
    );
    expect(diags[0]!.help).toBe(
      "Reject with an `Error` subclass, e.g. `Promise.reject(new Error(...))`.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("TYP");
  });
});
