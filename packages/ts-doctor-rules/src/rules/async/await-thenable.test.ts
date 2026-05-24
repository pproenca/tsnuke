import { describe, expect, it } from "vitest";
import { rule } from "./await-thenable.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("await-thenable (TYP / BC-10)", () => {
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
});
