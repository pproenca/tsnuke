import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-error-message-matching.js";

describe("no-error-message-matching (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags `/regex/.test(error.message)`", () => {
    const code =
      "declare const error: { message: string };\n" +
      "const bad = /Unknown command/i.test(error.message);\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `err.message.includes(...)`", () => {
    const code =
      'declare const err: Error;\nconst bad = err.message.includes("oops");\n';
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `.test(String(error))`", () => {
    const code =
      "declare const error: unknown;\nconst bad = /x/i.test(String(error));\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a plain string `.includes`", () => {
    const code = 'declare const s: string;\nconst ok = s.includes("x");\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // --- Added edge cases (heuristic boundary + position/message/severity/rule-id) ---

  it("carries the verbatim message/help + meta + rule-id in the diagnostic", () => {
    const code =
      'declare const err: Error;\nconst bad = err.message.includes("oops");\n';
    const diags = runRule(rule, code);
    expect(diags[0]!.rule).toBe("no-error-message-matching");
    expect(diags[0]!.message).toBe(
      "Classifying an error by matching its message string is fragile. Use typed errors (`instanceof`) or a discriminated error code.",
    );
    expect(diags[0]!.help).toBe(
      "Give errors a stable identity (subclass or a `code` discriminant) and branch on that, not on the human-readable message.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("reports the diagnostic on the line of the matching call", () => {
    const code =
      'declare const err: Error;\nconst bad = err.message.includes("oops");\n';
    const diags = runRule(rule, code);
    expect(diags[0]!.line).toBe(2);
  });

  it("flags an identifier named like an error as the receiver (`err.startsWith`)", () => {
    const code = 'declare const err: string;\nconst x = err.startsWith("E");\n';
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a non-match method on a message property (`.toUpperCase`)", () => {
    const code =
      "declare const error: { message: string };\nconst x = error.message.toUpperCase();\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
