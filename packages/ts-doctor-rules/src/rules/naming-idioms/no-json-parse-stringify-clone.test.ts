import { describe, expect, it } from "vitest";
import { rule } from "./no-json-parse-stringify-clone.js";
import { runRule } from "../../test-utils.js";

describe("no-json-parse-stringify-clone (SYN)", () => {
  it("flags the JSON.parse(JSON.stringify(x)) deep-clone idiom", () => {
    const diags = runRule(
      rule,
      "declare const obj: unknown;\nconst copy = JSON.parse(JSON.stringify(obj));\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("structuredClone()");
  });

  it("does not flag a plain JSON.parse of a raw string", () => {
    expect(
      runRule(
        rule,
        "declare const raw: string;\nconst data = JSON.parse(raw);\n",
      ),
    ).toHaveLength(0);
  });

  it("does not flag a lone JSON.stringify", () => {
    expect(
      runRule(
        rule,
        "declare const obj: unknown;\nconst s = JSON.stringify(obj);\n",
      ),
    ).toHaveLength(0);
  });
});
