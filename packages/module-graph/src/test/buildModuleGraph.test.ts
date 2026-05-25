/**
 * Characterization tests for `buildModuleGraph` (GRAPH tier).
 *
 * No legacy `.test.ts` existed for this module, so these crafted in-memory projects
 * ARE the behavioral spec: each feeds a small `GraphFileInput[]` (absolute `/proj/...`
 * paths) and asserts the resulting `ModuleGraph` (imports / exports / usedExports /
 * wildcardUsed). They cover relative-edge resolution (index.ts + extension candidates +
 * `.js`→`.ts` stem-swap), bare-import ignoring, dedup, default/named/namespace imports,
 * `export *` / re-export / dynamic import / `import = require`, exported-decl name
 * collection, and `export default` / `export =`. The differential equivalence proof
 * (modern === frozen legacy oracle) lives in `equivalence.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../main/buildModuleGraph.js";
import type { GraphFileInput } from "../main/buildModuleGraph.js";
import type { ModuleGraph } from "@tsnuke/rules-core-effect";

// --- helpers -------------------------------------------------------------------

const edges = (g: ModuleGraph, file: string): readonly string[] =>
  g.imports.get(file) ?? [];
const exportsOf = (g: ModuleGraph, file: string): readonly string[] =>
  g.exports.get(file) ?? [];
const usedOf = (g: ModuleGraph, file: string): string[] =>
  [...(g.usedExports.get(file) ?? new Set<string>())].sort();

// --- resolution ----------------------------------------------------------------

describe("buildModuleGraph — relative-specifier resolution", () => {
  it("resolves a bare relative specifier to its `.ts` candidate", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x } from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(usedOf(g, "/proj/b.ts")).toEqual(["x"]);
  });

  it("resolves a directory specifier to its index.ts", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { y } from "./sub";\n` },
      { filePath: "/proj/sub/index.ts", text: `export const y = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/sub/index.ts"]);
  });

  it("resolves an index.tsx directory specifier", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { y } from "./sub";\n` },
      { filePath: "/proj/sub/index.tsx", text: `export const y = 1;\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual([
      "/proj/sub/index.tsx",
    ]);
  });

  it("resolves a `.tsx` and a `.d.ts` candidate", () => {
    const tsx: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { c } from "./c";\n` },
      { filePath: "/proj/c.tsx", text: `export const c = 1;\n` },
    ];
    expect(edges(buildModuleGraph(tsx), "/proj/a.ts")).toEqual(["/proj/c.tsx"]);

    const dts: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { d } from "./d";\n` },
      { filePath: "/proj/d.d.ts", text: `export const d: number;\n` },
    ];
    expect(edges(buildModuleGraph(dts), "/proj/a.ts")).toEqual(["/proj/d.d.ts"]);
  });

  it("ESM `.js` specifier resolves to its `.ts` source (stem-swap)", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x } from "./b.js";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual(["/proj/b.ts"]);
  });

  it("ESM `.jsx` specifier resolves to its `.tsx` source (stem-swap)", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x } from "./b.jsx";\n` },
      { filePath: "/proj/b.tsx", text: `export const x = 1;\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual(["/proj/b.tsx"]);
  });

  it("resolves `..` parent-relative specifiers", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/sub/a.ts", text: `import { x } from "../b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/sub/a.ts")).toEqual(["/proj/b.ts"]);
  });

  it("IGNORES bare / package specifiers", () => {
    const files: GraphFileInput[] = [
      {
        filePath: "/proj/a.ts",
        text: `import ts from "typescript";\nimport { z } from "@scope/pkg";\n`,
      },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual([]);
    expect([...g.usedExports.keys()]).toEqual([]);
  });

  it("a specifier never resolves to its OWN file", () => {
    // `./a` from /proj/a.ts would resolve to /proj/a.ts — excluded (self-edge guard).
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x } from "./a";\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual([]);
  });

  it("an unresolvable relative specifier (no matching file) yields no edge", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x } from "./missing";\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual([]);
  });
});

// --- edges: dedup & encounter order --------------------------------------------

describe("buildModuleGraph — edges (dedup + encounter order)", () => {
  it("dedupes repeated edges to the same target", () => {
    const files: GraphFileInput[] = [
      {
        filePath: "/proj/a.ts",
        text: `import { x } from "./b";\nimport { y } from "./b";\nimport type { z } from "./b";\n`,
      },
      { filePath: "/proj/b.ts", text: `export const x = 1, y = 2;\nexport type z = number;\n` },
    ];
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual(["/proj/b.ts"]);
  });

  it("keeps edges in encounter order", () => {
    const files: GraphFileInput[] = [
      {
        filePath: "/proj/a.ts",
        text: `import "./c";\nimport "./b";\n`,
      },
      { filePath: "/proj/b.ts", text: `export const b = 1;\n` },
      { filePath: "/proj/c.ts", text: `export const c = 1;\n` },
    ];
    // bare side-effect imports still produce edges (resolve, addEdge, no usedExports).
    expect(edges(buildModuleGraph(files), "/proj/a.ts")).toEqual([
      "/proj/c.ts",
      "/proj/b.ts",
    ]);
  });
});

// --- import forms: usedExports / wildcardUsed ----------------------------------

describe("buildModuleGraph — import forms (used names + wildcard)", () => {
  it("default import marks `default` used", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import D from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export default 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(usedOf(g, "/proj/b.ts")).toEqual(["default"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(false);
  });

  it("named import marks each name used; aliased uses propertyName", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { x, y as yy } from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1, y = 2;\n` },
    ];
    // aliased `y as yy` records the SOURCE name `y` (propertyName), not the alias.
    expect(usedOf(buildModuleGraph(files), "/proj/b.ts")).toEqual(["x", "y"]);
  });

  it("default + named together record both", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import D, { x } from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export default 1;\nexport const x = 2;\n` },
    ];
    expect(usedOf(buildModuleGraph(files), "/proj/b.ts")).toEqual(["default", "x"]);
  });

  it("namespace import (`import * as ns`) marks the target wildcardUsed (not individual names)", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import * as ns from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(true);
    expect(g.usedExports.has("/proj/b.ts")).toBe(false);
  });

  it("dynamic `import(...)` marks an edge + wildcardUsed", () => {
    const files: GraphFileInput[] = [
      {
        filePath: "/proj/a.ts",
        text: `async function f() { const m = await import("./b"); return m; }\n`,
      },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(true);
  });

  it("`import x = require(\"./b\")` marks an edge + wildcardUsed", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import x = require("./b");\n` },
      { filePath: "/proj/b.ts", text: `export const y = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(true);
  });
});

// --- export forms ---------------------------------------------------------------

describe("buildModuleGraph — export-declaration forms", () => {
  it("`export * from \"x\"` adds an edge and marks x wildcardUsed", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `export * from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(true);
  });

  it("`export * as ns from \"x\"` adds an edge and marks x wildcardUsed", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `export * as ns from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const x = 1;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(true);
  });

  it("named re-export `export { a } from \"x\"` marks `a` used on x AND re-exports it", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `export { a, b as bb } from "./b";\n` },
      { filePath: "/proj/b.ts", text: `export const a = 1, b = 2;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    // used on x: SOURCE names (propertyName): a, b
    expect(usedOf(g, "/proj/b.ts")).toEqual(["a", "b"]);
    // re-exported under the EXPORTED names: a, bb
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["a", "bb"]);
    expect(g.wildcardUsed.has("/proj/b.ts")).toBe(false);
  });

  it("local `export { a }` (no `from`) records the export, no edge/usage", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `const a = 1;\nexport { a };\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual([]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["a"]);
  });
});

// --- exported declaration name collection --------------------------------------

describe("buildModuleGraph — exported declaration names", () => {
  it("collects function/class/interface/enum/module/type-alias names", () => {
    const text = [
      `export function fn() {}`,
      `export class Cls {}`,
      `export interface Iface {}`,
      `export enum En { A }`,
      `export namespace NS {}`,
      `export type Alias = number;`,
    ].join("\n");
    const g = buildModuleGraph([{ filePath: "/proj/a.ts", text }]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual([
      "fn",
      "Cls",
      "Iface",
      "En",
      "NS",
      "Alias",
    ]);
  });

  it("collects every name of an exported variable statement", () => {
    const g = buildModuleGraph([
      { filePath: "/proj/a.ts", text: `export const a = 1, b = 2, c = 3;\n` },
    ]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["a", "b", "c"]);
  });

  it("`export default function/class` collapses to `default`", () => {
    const fn = buildModuleGraph([
      { filePath: "/proj/a.ts", text: `export default function f() {}\n` },
    ]);
    expect(exportsOf(fn, "/proj/a.ts")).toEqual(["default"]);
  });

  it("`export default <expr>` (export assignment) records `default`", () => {
    const g = buildModuleGraph([
      { filePath: "/proj/a.ts", text: `const x = 1;\nexport default x;\n` },
    ]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["default"]);
  });

  it("`export = x` records `default`", () => {
    const g = buildModuleGraph([
      { filePath: "/proj/a.ts", text: `const x = 1;\nexport = x;\n` },
    ]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["default"]);
  });

  it("non-exported declarations are NOT collected", () => {
    const g = buildModuleGraph([
      { filePath: "/proj/a.ts", text: `function priv() {}\nconst hidden = 1;\n` },
    ]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual([]);
  });
});

// --- output shape --------------------------------------------------------------

describe("buildModuleGraph — output shape", () => {
  it("`files` equals the input filePaths in order", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/c.ts", text: `` },
      { filePath: "/proj/a.ts", text: `` },
      { filePath: "/proj/b.ts", text: `` },
    ];
    expect(buildModuleGraph(files).files).toEqual([
      "/proj/c.ts",
      "/proj/a.ts",
      "/proj/b.ts",
    ]);
  });

  it("every input file gets an `imports` and `exports` entry (even if empty)", () => {
    const files: GraphFileInput[] = [{ filePath: "/proj/a.ts", text: `` }];
    const g = buildModuleGraph(files);
    expect(g.imports.get("/proj/a.ts")).toEqual([]);
    expect(g.exports.get("/proj/a.ts")).toEqual([]);
  });

  it("an empty input yields empty maps/sets", () => {
    const g = buildModuleGraph([]);
    expect(g.files).toEqual([]);
    expect(g.imports.size).toBe(0);
    expect(g.exports.size).toBe(0);
    expect(g.usedExports.size).toBe(0);
    expect(g.wildcardUsed.size).toBe(0);
  });
});

// --- a small integrated multi-file project -------------------------------------

describe("buildModuleGraph — integrated multi-file project (cycle for RULE-015)", () => {
  it("builds a graph with a cycle a→b→a", () => {
    const files: GraphFileInput[] = [
      { filePath: "/proj/a.ts", text: `import { b } from "./b";\nexport const a = 1;\n` },
      { filePath: "/proj/b.ts", text: `import { a } from "./a";\nexport const b = 2;\n` },
    ];
    const g = buildModuleGraph(files);
    expect(edges(g, "/proj/a.ts")).toEqual(["/proj/b.ts"]);
    expect(edges(g, "/proj/b.ts")).toEqual(["/proj/a.ts"]);
    expect(exportsOf(g, "/proj/a.ts")).toEqual(["a"]);
    expect(exportsOf(g, "/proj/b.ts")).toEqual(["b"]);
    expect(usedOf(g, "/proj/a.ts")).toEqual(["a"]);
    expect(usedOf(g, "/proj/b.ts")).toEqual(["b"]);
  });
});
