import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-secrets-in-source.js";

/**
 * Every secret-shaped fixture is assembled by string concatenation so this test
 * file contains NO contiguous, real-shaped credential literal (which would trip
 * git-host secret scanning); the runtime-assembled string is a valid vendor-shape
 * fixture the rule must flag. Frozen patterns (RULE-025): AWS `AKIA`+16 upper/digit,
 * GitHub `ghp_`+36 alnum, Stripe `sk_live_`+16-or-more alnum.
 */
describe("no-secrets-in-source (SYN)", () => {
  // --- Ported legacy vectors (the equivalence spec) -------------------------
  it("flags a hardcoded AWS access key", () => {
    const fixture = `const k = "AKIA${"1234567890ABCDEF"}";\n`;
    const diags = runRule(rule, fixture);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag ordinary strings", () => {
    expect(runRule(rule, 'const s = "hello world";\n')).toHaveLength(0);
  });

  // --- Added: shape / message / severity equivalence -----------------------
  it("emits the exact message, help, severity and category", () => {
    const fixture = `const k = "AKIA${"1234567890ABCDEF"}";\n`;
    const diags = runRule(rule, fixture);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-secrets-in-source");
    expect(d.severity).toBe("error");
    expect(d.category).toBe("Security");
    expect(d.message).toBe("possible hardcoded secret");
    expect(d.help).toBe(
      "Move the credential to an environment variable or secrets manager, and rotate it.",
    );
    expect(d.line).toBe(1);
  });

  // --- Added: each FROZEN vendor shape is a positive -----------------------
  it("flags a GitHub personal access token (ghp_ + 36 alnum)", () => {
    const fixture = `const t = "ghp_${"a".repeat(36)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(1);
  });

  it("flags a Stripe live secret key (sk_live_ + 16+ alnum)", () => {
    const fixture = `const t = "sk_live_${"a".repeat(16)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(1);
  });

  it("flags a longer Stripe live key (sk_live_ is 16-or-more, unbounded)", () => {
    const fixture = `const t = "sk_live_${"a".repeat(40)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(1);
  });

  it("flags a secret inside a no-substitution template literal", () => {
    const fixture = `const k = \`AKIA${"1234567890ABCDEF"}\`;\n`;
    expect(runRule(rule, fixture)).toHaveLength(1);
  });

  // --- Added negatives: catch a too-greedy regex ---------------------------
  it("does not flag a too-short AWS key (AKIA + 15 chars)", () => {
    const fixture = `const k = "AKIA${"1234567890ABCDE"}";\n`; // 15 chars after AKIA
    expect(runRule(rule, fixture)).toHaveLength(0);
  });

  it("does not flag an AWS key with lowercase letters (pattern is [0-9A-Z])", () => {
    const fixture = `const k = "AKIA${"abcdefghij123456"}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(0);
  });

  it("does not flag a too-short GitHub token (ghp_ + 35 chars)", () => {
    const fixture = `const t = "ghp_${"a".repeat(35)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(0);
  });

  it("does not flag a too-short Stripe key (sk_live_ + 15 chars)", () => {
    const fixture = `const t = "sk_live_${"a".repeat(15)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(0);
  });

  it("does not flag the sk_test_ prefix (only sk_live_ is matched)", () => {
    const fixture = `const t = "sk_test_${"a".repeat(24)}";\n`;
    expect(runRule(rule, fixture)).toHaveLength(0);
  });

  it("does not flag plain prose that merely mentions AWS", () => {
    expect(
      runRule(rule, 'const s = "rotate the AWS key in the vault";\n'),
    ).toHaveLength(0);
  });
});
