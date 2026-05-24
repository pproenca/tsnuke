import { describe, expect, it } from "vitest";
import { rule } from "./no-namespace.js";
import { runRule } from "../../test-utils.js";

describe("no-namespace (SYN)", () => {
  it("flags a namespace declaration", () => {
    const diags = runRule(rule, "namespace Foo { export const x = 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("Foo");
  });

  it("does not flag an ambient `declare module \"pkg\"`", () => {
    expect(
      runRule(rule, 'declare module "pkg" { export const x: number; }\n'),
    ).toHaveLength(0);
  });
});
