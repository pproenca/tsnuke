import { describe, expect, it } from "vitest";
import { rule } from "./prefer-interface-for-large-object-type.js";
import { runRule } from "../../test-utils.js";

// 13 members — over LARGE_OBJECT_TYPE_MEMBERS = 12.
const LARGE_OBJECT_TYPE =
  "type T = {\n  a: number;\n  b: number;\n  c: number;\n  d: number;\n  e: number;\n  f: number;\n  g: number;\n  h: number;\n  i: number;\n  j: number;\n  k: number;\n  l: number;\n  m: number;\n};\n";

// 12 members — at the boundary, allowed.
const BOUNDARY_OBJECT_TYPE =
  "type T = {\n  a: number;\n  b: number;\n  c: number;\n  d: number;\n  e: number;\n  f: number;\n  g: number;\n  h: number;\n  i: number;\n  j: number;\n  k: number;\n  l: number;\n};\n";

describe("prefer-interface-for-large-object-type (SYN)", () => {
  it("flags an object type alias with more than 12 members", () => {
    const diags = runRule(rule, LARGE_OBJECT_TYPE);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-interface-for-large-object-type");
  });

  it("allows an object type alias at or under 12 members", () => {
    expect(runRule(rule, BOUNDARY_OBJECT_TYPE)).toHaveLength(0);
  });
});
