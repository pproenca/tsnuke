import { describe, expect, it } from "vitest";
import { rule } from "./no-error-message-matching.js";
import { runRule } from "../../test-utils.js";

describe("no-error-message-matching (SYN)", () => {
  it("flags `/regex/.test(error.message)`", () => {
    const code =
      "declare const error: { message: string };\n" +
      "const bad = /Unknown command/i.test(error.message);\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `err.message.includes(...)`", () => {
    const code = "declare const err: Error;\nconst bad = err.message.includes(\"oops\");\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `.test(String(error))`", () => {
    const code = "declare const error: unknown;\nconst bad = /x/i.test(String(error));\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a plain string `.includes`", () => {
    const code = "declare const s: string;\nconst ok = s.includes(\"x\");\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
