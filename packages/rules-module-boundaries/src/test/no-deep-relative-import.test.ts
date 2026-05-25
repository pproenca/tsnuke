import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-deep-relative-import.js";

describe("no-deep-relative-import (SYN) — RULE-011", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags an import that climbs four or more directories", () => {
    const diags = runRule(rule, 'import { x } from "../../../../deep/mod";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-deep-relative-import");
  });

  it("allows a shallow sibling import", () => {
    expect(runRule(rule, 'import { x } from "../sibling";\n')).toHaveLength(0);
  });

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/position)", () => {
    const diags = runRule(rule, 'import { x } from "../../../../deep/mod";\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-deep-relative-import");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Module Boundaries & Architecture");
    expect(d.plugin).toBe("ts-doctor");
    expect(d.message).toBe(
      "Deep relative import (4 levels) signals a missing module boundary.",
    );
    expect(d.help).toBe(
      "Use a path alias instead of climbing four or more directories with `../`.",
    );
    // Position pins to the module-specifier STRING LITERAL on line 1.
    // `import { x } from ` = 18 chars, so the `"` opens at col 19 (1-based).
    expect(d.line).toBe(1);
    expect(d.column).toBe(19);
  });

  // --- Added boundary cases: INCLUSIVE `>= 4` (distinct from budget rules' `>`) ---

  it("does NOT fire at exactly 3 leading `..` segments (below the inclusive `>= 4`)", () => {
    expect(
      runRule(rule, 'import { x } from "../../../deep/mod";\n'),
    ).toHaveLength(0);
  });

  it("DOES fire at exactly 4 leading `..` segments (the inclusive boundary `>= 4`)", () => {
    const diags = runRule(rule, 'import { x } from "../../../../deep/mod";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Deep relative import (4 levels) signals a missing module boundary.",
    );
  });

  it("fires at 5 leading `..` segments and reports the depth", () => {
    const diags = runRule(rule, 'import { x } from "../../../../../deep";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Deep relative import (5 levels) signals a missing module boundary.",
    );
  });

  // --- Added edge: only LEADING `..` count; scan breaks at first non-`..` ---

  it("does NOT count a mid-path `..` after a non-`..` segment (only leading `..`)", () => {
    // `a/../../../../deep` has only `a` as the first segment (not `..`), so the scan
    // breaks immediately at depth 0 — the later `..` climbs are NOT counted.
    expect(
      runRule(rule, 'import { x } from "a/../../../../deep";\n'),
    ).toHaveLength(0);
  });

  // --- Added edge: non-relative imports ignored (no leading `..`) ---

  it("ignores a non-relative (bare package) import", () => {
    expect(runRule(rule, 'import { x } from "@app/deep/mod";\n')).toHaveLength(
      0,
    );
  });

  it("ignores a non-relative node-module import", () => {
    expect(runRule(rule, 'import ts from "typescript";\n')).toHaveLength(0);
  });

  // --- Added: the rule also covers re-export declarations (export ... from) ---

  it("flags a deep relative re-export (export ... from)", () => {
    const diags = runRule(
      rule,
      'export { x } from "../../../../deep/mod";\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-deep-relative-import");
    expect(diags[0]!.message).toBe(
      "Deep relative import (4 levels) signals a missing module boundary.",
    );
  });

  it("allows a shallow relative re-export", () => {
    expect(runRule(rule, 'export { x } from "../sibling";\n')).toHaveLength(0);
  });
});
