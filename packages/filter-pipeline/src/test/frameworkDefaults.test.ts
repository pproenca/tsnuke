/**
 * P5 — framework-aware defaults catalog (the rationale-reinvention tax fix).
 *
 * Covers:
 *   - `compileGlob` understands the small subset (`**`, `*`, `{a,b}`).
 *   - The built-in catalog correctly suppresses the maddie-session FP shapes
 *     (Next.js routes, test files, barrel files).
 *   - Project-local additions stack with the built-ins.
 *   - A diagnostic that doesn't match ANY suppression survives.
 *   - The stage runs as part of `runFilterPipeline` (integration).
 */

import { describe, expect, it } from "vitest";
import {
  compileGlob,
  compileSuppressions,
  FRAMEWORK_SUPPRESSIONS,
  makeFrameworkDefaultsStage,
  runFilterPipeline,
  type DiagnosticWithTags,
} from "../main/index.js";
import type { TsNukeConfig } from "../main/Config.js";

const emptyConfig: TsNukeConfig = {};

const diag = (over: Partial<DiagnosticWithTags>): DiagnosticWithTags => ({
  filePath: "/repo/src/foo.ts",
  plugin: "tsnuke",
  rule: "some-rule",
  severity: "warning",
  message: "m",
  help: "h",
  category: "x",
  tier: "SYN",
  line: 1,
  column: 1,
  ...over,
});

describe("compileGlob — small-subset matcher", () => {
  it("matches `**\/foo.{ts,tsx}` against arbitrary depth", () => {
    const re = compileGlob("**/foo.{ts,tsx}");
    expect(re).not.toBeNull();
    expect(re!.test("foo.ts")).toBe(true);
    expect(re!.test("a/b/foo.ts")).toBe(true);
    expect(re!.test("a/foo.tsx")).toBe(true);
    expect(re!.test("a/foo.js")).toBe(false);
    expect(re!.test("a/foobar.ts")).toBe(false); // anchored, not substring
  });

  it("`**\/__tests__/**` matches any descendant of __tests__", () => {
    const re = compileGlob("**/__tests__/**");
    expect(re).not.toBeNull();
    expect(re!.test("src/__tests__/x.ts")).toBe(true);
    expect(re!.test("a/__tests__/deep/x.ts")).toBe(true);
    expect(re!.test("src/no-tests/x.ts")).toBe(false);
  });

  it("`*` matches a single path segment (not slash)", () => {
    const re = compileGlob("src/*/page.tsx");
    expect(re).not.toBeNull();
    expect(re!.test("src/app/page.tsx")).toBe(true);
    expect(re!.test("src/a/b/page.tsx")).toBe(false); // `*` doesn't cross /
  });

  it("returns null on malformed `{` alternation", () => {
    expect(compileGlob("**/foo.{ts")).toBeNull();
  });
});

describe("FRAMEWORK_SUPPRESSIONS — built-in catalog", () => {
  it("suppresses `no-default-export` on Next.js page.tsx files", () => {
    const stage = makeFrameworkDefaultsStage();
    expect(stage({ rule: "no-default-export", filePath: "src/app/page.tsx" })).toBe(false);
    expect(stage({ rule: "no-default-export", filePath: "apps/web/src/app/(marketing)/page.tsx" })).toBe(false);
  });

  it("suppresses `no-non-null-assertion` in test files", () => {
    const stage = makeFrameworkDefaultsStage();
    expect(stage({ rule: "no-non-null-assertion", filePath: "src/foo.test.ts" })).toBe(false);
    expect(stage({ rule: "no-non-null-assertion", filePath: "src/foo.spec.ts" })).toBe(false);
    expect(stage({ rule: "no-non-null-assertion", filePath: "src/__tests__/foo.ts" })).toBe(false);
  });

  it("suppresses `no-unused-exports` in barrel files", () => {
    const stage = makeFrameworkDefaultsStage();
    expect(stage({ rule: "no-unused-exports", filePath: "src/index.ts" })).toBe(false);
    expect(stage({ rule: "no-unused-exports", filePath: "packages/foo/src/index.tsx" })).toBe(false);
  });

  it("KEEPS the same rule in non-matching paths", () => {
    const stage = makeFrameworkDefaultsStage();
    // `no-default-export` should fire in a regular source file.
    expect(stage({ rule: "no-default-export", filePath: "src/utils/format.ts" })).toBe(true);
    // `no-non-null-assertion` in non-test code.
    expect(stage({ rule: "no-non-null-assertion", filePath: "src/utils/format.ts" })).toBe(true);
  });

  it("does NOT match other rules (only the catalogued ones)", () => {
    const stage = makeFrameworkDefaultsStage();
    expect(stage({ rule: "some-other-rule", filePath: "src/app/page.tsx" })).toBe(true);
  });

  it("catalogue covers the maddie-session FP rules at minimum", () => {
    const covered = new Set(FRAMEWORK_SUPPRESSIONS.map((s) => s.rule));
    // Every rule the agent rationalised away in the maddie 2026-05-27 session
    // for framework reasons should appear at least once.
    expect(covered.has("no-default-export")).toBe(true);
    expect(covered.has("no-non-null-assertion")).toBe(true);
    expect(covered.has("no-unused-exports")).toBe(true);
    expect(covered.has("require-await")).toBe(true);
  });
});

describe("project-local additions stack with built-ins", () => {
  it("project-local suppression on a new rule is applied", () => {
    const stage = makeFrameworkDefaultsStage([
      { rule: "no-explicit-any", fileGlob: "**/*.legacy.ts", reason: "marked legacy" },
    ]);
    expect(stage({ rule: "no-explicit-any", filePath: "src/foo.legacy.ts" })).toBe(false);
    expect(stage({ rule: "no-explicit-any", filePath: "src/foo.ts" })).toBe(true);
    // Built-ins still active alongside.
    expect(stage({ rule: "no-default-export", filePath: "src/app/page.tsx" })).toBe(false);
  });
});

describe("compileSuppressions — silently drops bad globs", () => {
  it("malformed entry doesn't crash the stage builder", () => {
    const compiled = compileSuppressions([
      { rule: "x", fileGlob: "**/foo.{ts", reason: "bad" }, // unmatched `{`
      { rule: "y", fileGlob: "**/*.ts", reason: "good" },
    ]);
    expect(compiled).toHaveLength(1);
    expect(compiled[0]!.rule).toBe("y");
  });
});

describe("integration — runFilterPipeline applies framework defaults", () => {
  it("drops a framework-suppressed diagnostic before scoring", () => {
    const diagnostics: DiagnosticWithTags[] = [
      diag({ rule: "no-default-export", filePath: "src/app/page.tsx" }), // suppressed
      diag({ rule: "no-default-export", filePath: "src/utils/foo.ts" }), // kept
    ];
    const out = runFilterPipeline(diagnostics, emptyConfig);
    expect(out).toHaveLength(1);
    expect(out[0]!.filePath).toBe("src/utils/foo.ts");
  });

  it("project-local additions plug into runFilterPipeline", () => {
    const diagnostics: DiagnosticWithTags[] = [
      diag({ rule: "no-explicit-any", filePath: "src/legacy/foo.ts" }),
      diag({ rule: "no-explicit-any", filePath: "src/modern/foo.ts" }),
    ];
    const out = runFilterPipeline(diagnostics, emptyConfig, {
      frameworkSuppressions: [
        { rule: "no-explicit-any", fileGlob: "**/legacy/**", reason: "wip" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.filePath).toBe("src/modern/foo.ts");
  });
});
