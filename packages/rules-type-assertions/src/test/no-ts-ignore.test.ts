import { describe, it, expect } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-ts-ignore.js";

// Ported VERBATIM from legacy `.../type-assertions/no-ts-ignore.test.ts`,
// plus comment-rule edges (the SourceFile-keyed full-text scan).
describe("SYN rule — no-ts-ignore", () => {
  it("flags a // @ts-ignore directive (BC-10: tier SYN)", () => {
    const code = ["// @ts-ignore", "const x: number = oops;", ""].join("\n");
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-ts-ignore");
    expect(d.plugin).toBe("ts-fix");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.line).toBe(1);
  });

  it("does not flag @ts-expect-error", () => {
    const code = "// @ts-expect-error\nconst x: number = oops;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags every occurrence", () => {
    const code = "// @ts-ignore\nfoo();\n// @ts-ignore\nbar();\n";
    expect(runRule(rule, code)).toHaveLength(2);
  });

  // Edge: `@ts-ignore` with a trailing reason is still flagged (unlike
  // `@ts-expect-error`, ts-ignore is unconditionally banned).
  it("flags `// @ts-ignore -- reason`", () => {
    expect(runRule(rule, "// @ts-ignore -- legacy\nfoo();\n")).toHaveLength(1);
  });

  // Negative: a clean file with no directive.
  it("does not flag a clean file", () => {
    expect(runRule(rule, "const x = 1;\n")).toHaveLength(0);
  });
});
