import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-nullish-coalescing.js";

describe("prefer-nullish-coalescing (TYP / BC-10)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags `||` on a nullable left operand under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string | undefined;\nfunction f() { return x || "default"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-nullish-coalescing");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag `||` on a non-nullable left operand", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string;\nfunction f() { return x || "default"; }\n',
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        'declare const x: string | undefined;\nfunction f() { return x || "default"; }\n',
      ),
    ).toHaveLength(0);
  });

  // --- Added edge cases (null left, && & ?? negatives, full shape) ---

  it("flags `||` on a `string | null` left operand", () => {
    expect(
      runTypeAwareRule(
        rule,
        'declare const x: string | null;\nfunction f() { return x || "d"; }\n',
      ),
    ).toHaveLength(1);
  });

  it("does NOT flag `&&` even with a nullable left operand", () => {
    expect(
      runTypeAwareRule(
        rule,
        'declare const x: string | undefined;\nfunction f() { return x && "d"; }\n',
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag an existing `??` (already nullish-coalescing)", () => {
    expect(
      runTypeAwareRule(
        rule,
        'declare const x: string | undefined;\nfunction f() { return x ?? "d"; }\n',
      ),
    ).toHaveLength(0);
  });

  it("carries the verbatim message/help + meta", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string | undefined;\nfunction f() { return x || "default"; }\n',
    );
    expect(diags[0]!.message).toBe(
      "Prefer `??` over `||`: the left operand is nullable, so `||` would also fall back on other falsy values.",
    );
    expect(diags[0]!.help).toBe(
      "Replace `||` with `??` so only `null`/`undefined` trigger the fallback.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
  });
});
