import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/default-case-last.js";

describe("default-case-last (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags a switch whose default is not last", () => {
    const diags = runRule(
      rule,
      "switch (x) { default: break; case 1: break; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("default-case-last");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("`default` clause should come last");
  });

  it("does not flag a switch whose default is last", () => {
    expect(
      runRule(rule, "switch (x) { case 1: break; default: break; }\n"),
    ).toHaveLength(0);
  });

  it("does not flag a switch with no default", () => {
    expect(
      runRule(rule, "switch (x) { case 1: break; case 2: break; }\n"),
    ).toHaveLength(0);
  });

  // --- Added edge cases (full diagnostic shape + position) ---

  it("carries the verbatim message/help + meta + rule-id", () => {
    const diags = runRule(
      rule,
      "switch (x) { default: break; case 1: break; }\n",
    );
    expect(diags[0]!.message).toBe(
      "the `default` clause should come last for readability",
    );
    expect(diags[0]!.help).toBe(
      "Reorder the `switch` so the `default` clause is the final clause.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.plugin).toBe("tsnuke");
  });

  it("reports 1-based line/column at the misplaced default clause", () => {
    // `switch (x) { ` is 13 chars; `default` begins at 0-based char 13 ⇒ column 14.
    const diags = runRule(
      rule,
      "switch (x) { default: break; case 1: break; }\n",
    );
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(14);
  });
});
