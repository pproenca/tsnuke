import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/only-throw-error.js";

describe("only-throw-error (TYP)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags throwing a string", () => {
    const diags = runTypeAwareRule(rule, 'throw "boom";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("does not flag throwing an Error", () => {
    expect(runTypeAwareRule(rule, 'throw new Error("x");\n')).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(runRule(rule, 'throw "boom";\n')).toHaveLength(0);
  });

  // --- Added edge cases (other primitives, severity, message/rule-id) ---

  it("flags throwing a number primitive", () => {
    expect(runTypeAwareRule(rule, "throw 42;\n")).toHaveLength(1);
  });

  it("flags throwing a boolean primitive", () => {
    expect(runTypeAwareRule(rule, "throw true;\n")).toHaveLength(1);
  });

  it("carries the verbatim message/help + meta + rule-id (severity=error)", () => {
    const diags = runTypeAwareRule(rule, 'throw "boom";\n');
    expect(diags[0]!.rule).toBe("only-throw-error");
    // The checker stringifies the literal type, not the widened `string` — the
    // message embeds `checker.typeToString(type)` verbatim from legacy.
    expect(diags[0]!.message).toBe('Throwing a non-Error value ("boom").');
    expect(diags[0]!.help).toBe(
      "Throw an `Error` subclass instead, e.g. `throw new Error(...)`.",
    );
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("reports 1-based line/column at the throw statement", () => {
    const diags = runTypeAwareRule(rule, 'throw "boom";\n');
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(1);
  });

  it("does NOT flag throwing an Error subclass instance", () => {
    const code =
      "class MyError extends Error {}\nthrow new MyError();\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });
});
