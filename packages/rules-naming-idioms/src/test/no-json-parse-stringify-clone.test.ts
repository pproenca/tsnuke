import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-json-parse-stringify-clone.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-json-parse-stringify-clone.test.ts`.
describe("no-json-parse-stringify-clone (SYN)", () => {
  it("flags the JSON.parse(JSON.stringify(x)) deep-clone idiom", () => {
    const diags = runRule(
      rule,
      "declare const obj: unknown;\nconst copy = JSON.parse(JSON.stringify(obj));\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("structuredClone()");
    expect(diags[0]!.rule).toBe("no-json-parse-stringify-clone");
    expect(diags[0]!.severity).toBe("warning");
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

  // Edge: codemod fixKind => no fix payload.
  it("declares fixKind codemod and emits no fix payload", () => {
    expect(rule.fixKind).toBe("codemod");
    const diags = runRule(
      rule,
      "declare const o: unknown;\nconst c = JSON.parse(JSON.stringify(o));\n",
    );
    expect(diags[0]!.fix).toBeUndefined();
  });
});
