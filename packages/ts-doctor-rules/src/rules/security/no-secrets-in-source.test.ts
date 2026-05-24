import { describe, expect, it } from "vitest";
import { rule } from "./no-secrets-in-source.js";
import { runRule } from "../../test-utils.js";

describe("no-secrets-in-source (SYN)", () => {
  it("flags a hardcoded AWS access key", () => {
    // Built by concatenation so the source file contains no contiguous, real-shaped
    // secret literal (which would trip git-host secret scanning); the assembled
    // runtime string is a valid AKIA-pattern fixture that the rule must flag.
    const fixture = `const k = "AKIA${"1234567890ABCDEF"}";\n`;
    const diags = runRule(rule, fixture);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag ordinary strings", () => {
    expect(runRule(rule, 'const s = "hello world";\n')).toHaveLength(0);
  });
});
