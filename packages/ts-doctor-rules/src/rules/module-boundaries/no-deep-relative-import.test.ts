import { describe, expect, it } from "vitest";
import { rule } from "./no-deep-relative-import.js";
import { runRule } from "../../test-utils.js";

describe("no-deep-relative-import (SYN)", () => {
  it("flags an import that climbs four or more directories", () => {
    const diags = runRule(rule, 'import { x } from "../../../../deep/mod";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-deep-relative-import");
  });

  it("allows a shallow sibling import", () => {
    expect(runRule(rule, 'import { x } from "../sibling";\n')).toHaveLength(0);
  });
});
