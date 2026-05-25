/**
 * Characterization tests for Stage 3 — ignore (RULE-023 Stage 3).
 *
 * RULE-023 Stage 3 drops a diagnostic by:
 *  - `ignore.rules` (bare or `plugin/rule`)
 *  - `ignore.files` (exact `===` / suffix `endsWith` / substring `includes`)
 *  - `ignore.overrides` (`{files, rules?}`; no `rules` ⇒ drop ALL in those files;
 *    with `rules` ⇒ drop only those rules — bare or `plugin/rule` — in those files)
 *
 * The file-match helper `fileMatches` is tested directly for the three modes.
 */

import { describe, expect, it } from "vitest";
import { fileMatches, makeIgnoreStage } from "../main/index.js";
import { diag } from "./helpers.js";

describe("fileMatches — RULE-023 Stage 3 (exact / suffix / substring)", () => {
  it("exact match (===)", () => {
    expect(fileMatches("/x/a.ts", "/x/a.ts")).toBe(true);
  });
  it("suffix match (endsWith)", () => {
    expect(fileMatches("/x/y/a.ts", "a.ts")).toBe(true);
    expect(fileMatches("/src/components/Button.tsx", ".tsx")).toBe(true);
  });
  it("substring match (includes)", () => {
    expect(fileMatches("/x/generated/a.ts", "generated")).toBe(true);
    expect(fileMatches("/x/node_modules/p/i.ts", "node_modules")).toBe(true);
  });
  it("no match", () => {
    expect(fileMatches("/x/a.ts", "/y/b.ts")).toBe(false);
    expect(fileMatches("/x/a.ts", "z")).toBe(false);
  });
});

describe("makeIgnoreStage — RULE-023 Stage 3 (ignore.rules)", () => {
  it("drops by bare rule id", () => {
    const stage = makeIgnoreStage({ ignore: { rules: ["ignored-rule"] } });
    expect(stage(diag({ rule: "ignored-rule" }))).toBeNull();
  });

  it("drops by namespaced plugin/rule id", () => {
    const stage = makeIgnoreStage({ ignore: { rules: ["ts-fix/ignored"] } });
    expect(stage(diag({ plugin: "ts-fix", rule: "ignored" }))).toBeNull();
  });

  it("keeps a rule not in the ignore list", () => {
    const stage = makeIgnoreStage({ ignore: { rules: ["other"] } });
    const d = diag({ rule: "kept" });
    expect(stage(d)).toBe(d);
  });
});

describe("makeIgnoreStage — RULE-023 Stage 3 (ignore.files)", () => {
  it("drops by exact file path", () => {
    const stage = makeIgnoreStage({ ignore: { files: ["/x/a.ts"] } });
    expect(stage(diag({ rule: "r", filePath: "/x/a.ts" }))).toBeNull();
  });
  it("drops by suffix", () => {
    const stage = makeIgnoreStage({ ignore: { files: ["a.ts"] } });
    expect(stage(diag({ rule: "r", filePath: "/deep/path/a.ts" }))).toBeNull();
  });
  it("drops by substring", () => {
    const stage = makeIgnoreStage({ ignore: { files: ["generated"] } });
    expect(stage(diag({ rule: "r", filePath: "/x/generated/a.ts" }))).toBeNull();
  });
  it("keeps a file that matches none of the patterns", () => {
    const stage = makeIgnoreStage({ ignore: { files: ["b.ts"] } });
    const d = diag({ rule: "r", filePath: "/x/a.ts" });
    expect(stage(d)).toBe(d);
  });
});

describe("makeIgnoreStage — RULE-023 Stage 3 (ignore.overrides WITHOUT rules)", () => {
  it("drops ALL diagnostics in matched files when override has no rules", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"] }] },
    });
    expect(stage(diag({ rule: "anything", filePath: "/x/c.ts" }))).toBeNull();
    expect(stage(diag({ rule: "whatever", filePath: "/x/c.ts" }))).toBeNull();
  });

  it("does not drop diagnostics in non-matched files", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"] }] },
    });
    const d = diag({ rule: "r", filePath: "/x/d.ts" });
    expect(stage(d)).toBe(d);
  });
});

describe("makeIgnoreStage — RULE-023 Stage 3 (ignore.overrides WITH rules)", () => {
  it("drops only the listed rules in matched files (bare)", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped"] }] },
    });
    expect(stage(diag({ rule: "scoped", filePath: "/x/c.ts" }))).toBeNull();
  });

  it("drops a scoped rule by namespaced plugin/rule id", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"], rules: ["ts-fix/scoped"] }] },
    });
    expect(stage(diag({ plugin: "ts-fix", rule: "scoped", filePath: "/x/c.ts" }))).toBeNull();
  });

  it("keeps a non-listed rule in a matched file", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped"] }] },
    });
    const d = diag({ rule: "other", filePath: "/x/c.ts" });
    expect(stage(d)).toBe(d);
  });

  it("keeps a listed rule in a NON-matched file", () => {
    const stage = makeIgnoreStage({
      ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped"] }] },
    });
    const d = diag({ rule: "scoped", filePath: "/x/d.ts" });
    expect(stage(d)).toBe(d);
  });
});

describe("makeIgnoreStage — RULE-023 Stage 3 (combined + empty)", () => {
  it("empty config = identity", () => {
    const stage = makeIgnoreStage({});
    const d = diag({ rule: "r" });
    expect(stage(d)).toBe(d);
  });

  it("empty ignore object = identity", () => {
    const stage = makeIgnoreStage({ ignore: {} });
    const d = diag({ rule: "r" });
    expect(stage(d)).toBe(d);
  });
});
