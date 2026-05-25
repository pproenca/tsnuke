import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/switch-exhaustiveness-check.js";

describe("switch-exhaustiveness-check (TYP / BC-10 / RULE-025 false-negative bias)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags a non-exhaustive switch over a literal union", () => {
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; case "g": break; }\n';
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("switch-exhaustiveness-check");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.message).toContain('"b"');
  });

  it("does not flag an exhaustive switch", () => {
    const code =
      'declare const c: "r" | "g";\nswitch (c) { case "r": break; case "g": break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag when a default branch is present", () => {
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; default: break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("ignores a switch over a non-literal discriminant (conservative)", () => {
    const code = "declare const n: number;\nswitch (n) { case 1: break; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "switch (1 as 1 | 2) { case 1: break; }\n"),
    ).toHaveLength(0);
  });

  // --- Added edge cases: RULE-025 false-negative bias explicitly ---

  it("FALSE-NEGATIVE bias: a `default` clause suppresses an otherwise non-exhaustive switch", () => {
    // `b` is unhandled, yet the presence of `default` makes the rule bail.
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; case "g": break; default: break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("FALSE-NEGATIVE bias: a non-literal union member makes the whole switch bail", () => {
    // `string` is a non-literal constituent ⇒ literalMembers() returns null ⇒ no report,
    // even though the "r"/"g" literals are clearly unhandled-by-name.
    const code =
      'declare const c: "r" | "g" | string;\nswitch (c) { case "r": break; }\n';
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("flags a non-exhaustive numeric literal union", () => {
    const code =
      "declare const n: 1 | 2 | 3;\nswitch (n) { case 1: break; case 2: break; }\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("3");
  });

  it("carries the verbatim help + meta (severity=error) and reports at the switch", () => {
    const code =
      'declare const c: "r" | "g" | "b";\nswitch (c) { case "r": break; case "g": break; }\n';
    const diags = runTypeAwareRule(rule, code);
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.message).toBe('Non-exhaustive switch: missing case(s) "b".');
    expect(diags[0]!.help).toBe(
      "Add the missing case(s), or a `default` branch (ideally with a `never` exhaustiveness assertion).",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
    // line 2: the `switch` keyword begins at column 1.
    expect(diags[0]!.line).toBe(2);
    expect(diags[0]!.column).toBe(1);
  });
});
