/**
 * Characterization tests for `loadConfigPlugins` — RULE-039 (P0) / BC-18.
 *
 * THE LOAD-BEARING SECURITY INVARIANT. react-doctor auto-`require`d plugins
 * declared in a SCANNED repo's config — a CWE-94 arbitrary-code-execution path.
 * ts-doctor v1 ships a first-party catalog ONLY: `loadConfigPlugins` NEVER
 * resolves / requires / imports / executes anything. It ALWAYS returns
 * `{ plugins: [], ignored, warnings }`:
 *   - `plugins`  is always `[]`
 *   - `ignored`  = the declared string plugin names (non-strings filtered out)
 *   - `warnings` = one human-readable warning per ignored plugin
 *
 * The RCE class is removed BY CONSTRUCTION. Two test layers enforce this:
 *   1. Behavioral: any input yields `plugins: []`.
 *   2. By-construction: the SOURCE of every main module contains no
 *      `require` / `import(` / `eval` / `new Function` / `.resolve(` token.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigPlugins } from "../main/index.js";

describe("loadConfigPlugins — RULE-039 (always returns empty plugins, loads nothing)", () => {
  it("a scanned-repo plugin entry loads NOTHING (RCE removed by construction)", () => {
    const result = loadConfigPlugins({ plugins: ["./evil.js"] });
    expect(result.plugins).toEqual([]); // nothing required/loaded
    expect(result.ignored).toEqual(["./evil.js"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("./evil.js");
  });

  it("no plugins declared -> empty everything", () => {
    const result = loadConfigPlugins({});
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("multiple declared plugins -> all ignored, one warning each", () => {
    const result = loadConfigPlugins({
      plugins: ["@scope/plug", "../up.js", "/abs/evil.js"],
    });
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual(["@scope/plug", "../up.js", "/abs/evil.js"]);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toContain("@scope/plug");
    expect(result.warnings[1]).toContain("../up.js");
    expect(result.warnings[2]).toContain("/abs/evil.js");
  });

  it("an empty plugins array -> empty everything", () => {
    const result = loadConfigPlugins({ plugins: [] });
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("filters out non-string entries defensively (still loads nothing)", () => {
    // A malformed config could carry non-strings; they are dropped from
    // `ignored` and never reach any (non-existent) load path.
    const config = { plugins: [123, null, "ok.js", { x: 1 }] } as unknown as {
      plugins?: string[];
    };
    const result = loadConfigPlugins(config);
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual(["ok.js"]);
    expect(result.warnings).toHaveLength(1);
  });

  it("tolerates a non-array `plugins` field (lenient, loads nothing)", () => {
    const config = { plugins: "not-an-array" } as unknown as { plugins?: string[] };
    const result = loadConfigPlugins(config);
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("loadConfigPlugins — RULE-039 (no plugins property is ever non-empty across many inputs)", () => {
  it("plugins is `[]` for EVERY enumerated config input", () => {
    const inputs: ReadonlyArray<{ plugins?: unknown }> = [
      {},
      { plugins: [] },
      { plugins: ["a"] },
      { plugins: ["a", "b", "c"] },
      { plugins: ["./rel", "../up", "/abs", "@scope/x", "bare-name"] },
      { plugins: undefined },
      { plugins: null as unknown as string[] },
      { plugins: "string" as unknown as string[] },
      { plugins: [1, 2, 3] as unknown as string[] },
    ];
    for (const input of inputs) {
      const result = loadConfigPlugins(input as { plugins?: string[] });
      expect(result.plugins).toEqual([]);
      expect(result.warnings).toHaveLength(result.ignored.length);
    }
  });
});

describe("loadConfigPlugins — RULE-039 (by construction: source has zero code-execution paths)", () => {
  // Statically scan EVERY main-source file for any dynamic code-execution token.
  // If a future edit ever reintroduces a plugin-loading path, this test fails —
  // the P0 invariant is enforced at the source level, not just behaviorally.
  const mainDir = join(dirname(fileURLToPath(import.meta.url)), "..", "main");

  // Patterns that would indicate a code-execution / module-resolution path.
  // Word-boundaried / paren-anchored so ordinary identifiers don't false-positive.
  const FORBIDDEN: ReadonlyArray<{ label: string; re: RegExp }> = [
    { label: "require(", re: /\brequire\s*\(/ },
    { label: "require.resolve", re: /\brequire\s*\.\s*resolve\b/ },
    { label: "dynamic import(", re: /\bimport\s*\(/ },
    { label: "eval(", re: /\beval\s*\(/ },
    { label: "new Function(", re: /\bnew\s+Function\s*\(/ },
    { label: "Function( constructor call", re: /[^.\w]Function\s*\(/ },
    { label: "createRequire", re: /\bcreateRequire\b/ },
    // `\.resolve\s*\(` targets `x.resolve(` (module resolution); the legit bare
    // `resolve(` from node:path has no leading dot, so it does not false-positive.
    { label: ".resolve( (module resolution)", re: /\.resolve\s*\(/ },
    { label: "import.meta.resolve", re: /\bimport\s*\.\s*meta\s*\.\s*resolve\b/ },
    { label: "process.binding", re: /\bprocess\s*\.\s*binding\b/ },
    { label: "child_process", re: /child_process/ },
    { label: "node:vm", re: /node:vm\b/ },
  ];

  const sourceFiles = readdirSync(mainDir).filter((f) => f.endsWith(".ts"));

  it("there is at least one main source file to scan", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const file of sourceFiles) {
    it(`${file} contains no code-execution / module-resolution token (RULE-039)`, () => {
      const src = readFileSync(join(mainDir, file), "utf8");
      for (const { label, re } of FORBIDDEN) {
        expect(re.test(src), `${file} must not contain ${label}`).toBe(false);
      }
    });
  }
});
