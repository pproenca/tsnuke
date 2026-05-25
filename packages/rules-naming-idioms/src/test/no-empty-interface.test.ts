import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-empty-interface.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-empty-interface.test.ts`.
describe("no-empty-interface (SYN)", () => {
  it("flags an empty interface with no members or heritage", () => {
    const diags = runRule(rule, "interface X {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("X");
    expect(diags[0]!.rule).toBe("no-empty-interface");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag an interface with members", () => {
    expect(runRule(rule, "interface Y { a: number }\n")).toHaveLength(0);
  });

  it("does not flag an empty interface that extends a base", () => {
    expect(
      runRule(rule, "interface Base { a: number }\ninterface Z extends Base {}\n"),
    ).toHaveLength(0);
  });

  // Edge: manual fixKind => no fix payload (correctly advertised as manual).
  it("declares fixKind manual and emits no fix payload", () => {
    expect(rule.fixKind).toBe("manual");
    expect(runRule(rule, "interface X {}\n")[0]!.fix).toBeUndefined();
  });
});
