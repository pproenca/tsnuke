/**
 * Set-level stage tests (catalog hygiene, 2026-05-28). Pins:
 *   - `suppressByHierarchy` drops documented victims when the specifier fires on
 *     the same (filePath, line); leaves all other diagnostics untouched.
 *
 * The stage MUST be pure; it doesn't mutate the input.
 */

import { describe, expect, it } from "vitest";
import type { DiagnosticWithTags } from "../main/index.js";
import {
  DEFAULT_SUPPRESSION_HIERARCHY,
  suppressByHierarchy,
} from "../main/setStages.js";

function diag(over: Partial<DiagnosticWithTags> & { rule: string }): DiagnosticWithTags {
  return {
    filePath: "/repo/src/a.ts",
    plugin: "tsnuke",
    severity: "warning",
    message: `msg-${over.rule}`,
    help: `help-${over.rule}`,
    line: 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

describe("suppressByHierarchy", () => {
  it("drops victims when the specifier fires on the same (filePath, line)", () => {
    const specifier = diag({ rule: "no-assertion-on-json-parse", line: 7 });
    const victim1 = diag({ rule: "no-cast-in-return", line: 7 });
    const victim2 = diag({ rule: "no-unsafe-return", line: 7 });
    const unrelated = diag({ rule: "no-any", line: 7 });

    const out = suppressByHierarchy([specifier, victim1, victim2, unrelated]);
    expect(out.map((d) => d.rule)).toEqual([
      "no-assertion-on-json-parse",
      "no-any",
    ]);
  });

  it("does NOT drop victims on a different line", () => {
    const specifier = diag({ rule: "no-assertion-on-json-parse", line: 7 });
    const victimOtherLine = diag({ rule: "no-cast-in-return", line: 8 });
    const out = suppressByHierarchy([specifier, victimOtherLine]);
    expect(out).toHaveLength(2);
  });

  it("does NOT drop victims on a different file at the same line number", () => {
    const specifier = diag({
      rule: "no-assertion-on-json-parse",
      line: 7,
      filePath: "/a.ts",
    });
    const victimOtherFile = diag({
      rule: "no-cast-in-return",
      line: 7,
      filePath: "/b.ts",
    });
    const out = suppressByHierarchy([specifier, victimOtherFile]);
    expect(out).toHaveLength(2);
  });

  it("no specifier present → nothing is suppressed", () => {
    const a = diag({ rule: "no-cast-in-return", line: 7 });
    const b = diag({ rule: "no-unsafe-return", line: 7 });
    const out = suppressByHierarchy([a, b]);
    expect(out).toHaveLength(2);
  });

  it("preserves input order for surviving diagnostics", () => {
    const a = diag({ rule: "first", line: 1 });
    const b = diag({ rule: "no-cast-after-guard", line: 1 });
    const c = diag({ rule: "no-unsafe-object-assertion", line: 1 });
    const d = diag({ rule: "last", line: 1 });
    const out = suppressByHierarchy([a, b, c, d]);
    expect(out.map((d) => d.rule)).toEqual(["first", "no-cast-after-guard", "last"]);
  });

  it("honors a CALLER-PROVIDED hierarchy (DEFAULT_SUPPRESSION_HIERARCHY not required)", () => {
    const specifier = diag({ rule: "my-specific-rule", line: 1 });
    const victim = diag({ rule: "my-downstream-rule", line: 1 });
    const out = suppressByHierarchy([specifier, victim], {
      "my-specific-rule": ["my-downstream-rule"],
    });
    expect(out.map((d) => d.rule)).toEqual(["my-specific-rule"]);
  });

  it("DEFAULT_SUPPRESSION_HIERARCHY covers the three documented audit pairs", () => {
    expect(DEFAULT_SUPPRESSION_HIERARCHY["no-assertion-on-json-parse"]).toEqual([
      "no-cast-in-return",
      "no-unsafe-return",
    ]);
    expect(DEFAULT_SUPPRESSION_HIERARCHY["no-cast-after-guard"]).toEqual([
      "no-unsafe-object-assertion",
      "no-cast-in-return",
    ]);
    expect(DEFAULT_SUPPRESSION_HIERARCHY["no-non-null-asserted-optional-chain"]).toEqual([
      "no-non-null-assertion",
    ]);
  });
});

