import { describe, expect, it } from "vitest";
import { rule } from "./no-large-union-type.js";
import { runRule } from "../../test-utils.js";

// 13 string-literal members — over MAX_UNION_MEMBERS = 12.
const LARGE_UNION =
  'type T =\n  | "a"\n  | "b"\n  | "c"\n  | "d"\n  | "e"\n  | "f"\n  | "g"\n  | "h"\n  | "i"\n  | "j"\n  | "k"\n  | "l"\n  | "m";\n';

// 12 members — at the boundary, allowed.
const BOUNDARY_UNION =
  'type T =\n  | "a"\n  | "b"\n  | "c"\n  | "d"\n  | "e"\n  | "f"\n  | "g"\n  | "h"\n  | "i"\n  | "j"\n  | "k"\n  | "l";\n';

describe("no-large-union-type (SYN)", () => {
  it("flags a union with more than 12 members", () => {
    const diags = runRule(rule, LARGE_UNION);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-large-union-type");
  });

  it("allows a union at or under 12 members", () => {
    expect(runRule(rule, BOUNDARY_UNION)).toHaveLength(0);
  });
});
