import { describe, expect, it } from "vitest";
import { rule } from "./no-assertion-on-json-parse.js";
import { runRule } from "../../test-utils.js";

describe("no-assertion-on-json-parse (SYN)", () => {
  it("flags `JSON.parse(...) as T`", () => {
    const diags = runRule(
      rule,
      "declare const raw: string;\nconst data = JSON.parse(raw) as { id: number };\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("JSON.parse");
  });

  it("does not flag an unasserted `JSON.parse`", () => {
    expect(
      runRule(rule, "declare const raw: string;\nconst data = JSON.parse(raw);\n"),
    ).toHaveLength(0);
  });
});
