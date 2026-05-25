/**
 * THE EQUIVALENCE PROOF — differential test, modern vs frozen legacy oracle.
 *
 * No legacy `.test.ts` existed for `module-graph.ts`, so "equivalence" cannot mean
 * "re-run the legacy tests". Instead we pin the modern `buildModuleGraph` against a
 * vendored, frozen snapshot of the legacy algorithm itself (`./oracle.ts`, a verbatim
 * copy of `legacy/ts-fix/packages/core/src/module-graph.ts` + helpers `candidatesFor`
 * / `exportedNamesOfStatement`). For every crafted fixture we assert modern === oracle,
 * comparing the full `ModuleGraph` DEEPLY: the `imports`/`exports` arrays (order-sensitive,
 * since edges are encounter-ordered) and the `usedExports`/`wildcardUsed` Set contents
 * (order-insensitive) — Map/Set members that `toEqual` would otherwise miss.
 *
 * The fixtures are a superset of the per-form cases in `buildModuleGraph.test.ts`, packed
 * into multi-file projects so resolution, dedup, every import/export form, and the
 * stem-swap all run through both implementations side by side.
 */

import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../main/buildModuleGraph.js";
import type { GraphFileInput } from "../main/buildModuleGraph.js";
import { buildModuleGraphOracle } from "./oracle.js";
import type { OracleModuleGraph } from "./oracle.js";
import type { ModuleGraph } from "@ts-fix/rules-core-effect";

// ---------------------------------------------------------------------------
// Deep, structure-aware comparison of two ModuleGraphs (Map/Set aware).
// ---------------------------------------------------------------------------

/** Plain, comparable snapshot of a ModuleGraph: arrays + sorted Set arrays. */
interface GraphSnapshot {
  files: readonly string[];
  imports: ReadonlyArray<readonly [string, readonly string[]]>;
  exports: ReadonlyArray<readonly [string, readonly string[]]>;
  usedExports: ReadonlyArray<readonly [string, readonly string[]]>;
  wildcardUsed: readonly string[];
}

function snapshot(g: ModuleGraph | OracleModuleGraph): GraphSnapshot {
  // Sort the Map keys so two graphs with equal content but different insertion
  // order still compare equal on the keyed members; the per-key VALUE arrays for
  // `imports`/`exports` stay in their original (encounter) order — that order is
  // load-bearing and must match exactly.
  const keyed = (
    m: ReadonlyMap<string, readonly string[]>,
  ): ReadonlyArray<readonly [string, readonly string[]]> =>
    [...m.entries()]
      .map(([k, v]) => [k, v] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const keyedSets = (
    m: ReadonlyMap<string, ReadonlySet<string>>,
  ): ReadonlyArray<readonly [string, readonly string[]]> =>
    [...m.entries()]
      .map(([k, v]) => [k, [...v].sort()] as const) // Set order is irrelevant
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return {
    files: g.files,
    imports: keyed(g.imports),
    exports: keyed(g.exports),
    usedExports: keyedSets(g.usedExports),
    wildcardUsed: [...g.wildcardUsed].sort(),
  };
}

function expectEquivalent(files: readonly GraphFileInput[]): void {
  const modern = snapshot(buildModuleGraph(files));
  const oracle = snapshot(buildModuleGraphOracle(files));
  expect(modern).toEqual(oracle);
}

// ---------------------------------------------------------------------------
// Fixtures — multi-file projects exercising every documented behavior.
// ---------------------------------------------------------------------------

const FIXTURES: ReadonlyArray<{ name: string; files: GraphFileInput[] }> = [
  {
    name: "empty project",
    files: [],
  },
  {
    name: "single file, no imports/exports",
    files: [{ filePath: "/proj/a.ts", text: `const x = 1;\n` }],
  },
  {
    name: "relative resolution: .ts / index.ts / index.tsx / .tsx / .d.ts / .js+.jsx+.mjs+.cjs stem-swap",
    files: [
      {
        filePath: "/proj/a.ts",
        text: [
          `import { b } from "./b";`,
          `import { y } from "./sub";`,
          `import { c } from "./c";`,
          `import { d } from "./d";`,
          `import { e } from "./e.js";`,
          `import { f } from "./f.jsx";`,
          `import { g } from "./g.mjs";`, // stem-swap .mjs → .ts
          `import { h } from "./h.cjs";`, // stem-swap .cjs → .tsx
          `import { z } from "./sub2";`, // index.tsx resolution
        ].join("\n"),
      },
      { filePath: "/proj/b.ts", text: `export const b = 1;\n` },
      { filePath: "/proj/sub/index.ts", text: `export const y = 1;\n` },
      { filePath: "/proj/c.tsx", text: `export const c = 1;\n` },
      { filePath: "/proj/d.d.ts", text: `export const d: number;\n` },
      { filePath: "/proj/e.ts", text: `export const e = 1;\n` },
      { filePath: "/proj/f.tsx", text: `export const f = 1;\n` },
      { filePath: "/proj/g.ts", text: `export const g = 1;\n` },
      { filePath: "/proj/h.tsx", text: `export const h = 1;\n` },
      { filePath: "/proj/sub2/index.tsx", text: `export const z = 1;\n` },
    ],
  },
  {
    name: "bare/package imports ignored + parent-relative + self-edge guard",
    files: [
      {
        filePath: "/proj/sub/a.ts",
        text: [
          `import ts from "typescript";`,
          `import { z } from "@scope/pkg";`,
          `import { b } from "../b";`,
          `import { self } from "./a";`, // self — must be excluded
        ].join("\n"),
      },
      { filePath: "/proj/b.ts", text: `export const b = 1;\n` },
    ],
  },
  {
    name: "edge dedup + encounter order + side-effect imports",
    files: [
      {
        filePath: "/proj/a.ts",
        text: [
          `import "./c";`,
          `import { x } from "./b";`,
          `import { y } from "./b";`,
          `import type { t } from "./b";`,
        ].join("\n"),
      },
      { filePath: "/proj/b.ts", text: `export const x = 1, y = 2;\nexport type t = number;\n` },
      { filePath: "/proj/c.ts", text: `export const c = 1;\n` },
    ],
  },
  {
    name: "import forms: default / named-aliased / namespace / default+named",
    files: [
      {
        filePath: "/proj/a.ts",
        text: [
          `import D from "./def";`,
          `import { x, y as yy } from "./named";`,
          `import * as ns from "./nsmod";`,
          `import Def2, { z } from "./mixed";`,
        ].join("\n"),
      },
      { filePath: "/proj/def.ts", text: `export default 1;\n` },
      { filePath: "/proj/named.ts", text: `export const x = 1, y = 2;\n` },
      { filePath: "/proj/nsmod.ts", text: `export const a = 1;\n` },
      { filePath: "/proj/mixed.ts", text: `export default 1;\nexport const z = 2;\n` },
    ],
  },
  {
    name: "dynamic import + import = require",
    files: [
      {
        filePath: "/proj/a.ts",
        text: [
          `import eq = require("./eq");`,
          `async function f() { return import("./dyn"); }`,
        ].join("\n"),
      },
      { filePath: "/proj/eq.ts", text: `export const e = 1;\n` },
      { filePath: "/proj/dyn.ts", text: `export const d = 1;\n` },
    ],
  },
  {
    name: "export forms: export * / export * as ns / named re-export / local export {}",
    files: [
      {
        filePath: "/proj/barrel.ts",
        text: [
          `export * from "./star";`,
          `export * as nsRe from "./starns";`,
          `export { a, b as bb } from "./re";`,
        ].join("\n"),
      },
      {
        filePath: "/proj/local.ts",
        text: `const a = 1;\nconst b = 2;\nexport { a, b as renamed };\n`,
      },
      { filePath: "/proj/star.ts", text: `export const s = 1;\n` },
      { filePath: "/proj/starns.ts", text: `export const sn = 1;\n` },
      { filePath: "/proj/re.ts", text: `export const a = 1, b = 2;\n` },
    ],
  },
  {
    name: "exported declaration names + export default decl + export assignment + export =",
    files: [
      {
        filePath: "/proj/decls.ts",
        text: [
          `export function fn() {}`,
          `export class Cls {}`,
          `export interface Iface {}`,
          `export enum En { A }`,
          `export namespace NS {}`,
          `export type Alias = number;`,
          `export const c1 = 1, c2 = 2;`,
          `function priv() {}`,
        ].join("\n"),
      },
      { filePath: "/proj/def-fn.ts", text: `export default function f() {}\n` },
      { filePath: "/proj/def-expr.ts", text: `const x = 1;\nexport default x;\n` },
      { filePath: "/proj/eq.ts", text: `const x = 1;\nexport = x;\n` },
    ],
  },
  {
    name: "cycle a→b→a (RULE-015 graph)",
    files: [
      { filePath: "/proj/a.ts", text: `import { b } from "./b";\nexport const a = 1;\n` },
      { filePath: "/proj/b.ts", text: `import { a } from "./a";\nexport const b = 2;\n` },
    ],
  },
  {
    name: "TSX file (ScriptKind branch) with JSX + relative import",
    files: [
      {
        filePath: "/proj/View.tsx",
        text: `import { useThing } from "./hook";\nexport const View = () => <div />;\n`,
      },
      { filePath: "/proj/hook.ts", text: `export function useThing() {}\n` },
    ],
  },
  {
    name: "unresolvable relative specifier + multiple consumers of one file",
    files: [
      { filePath: "/proj/a.ts", text: `import { x } from "./missing";\nimport { v } from "./shared";\n` },
      { filePath: "/proj/b.ts", text: `import { w } from "./shared";\n` },
      { filePath: "/proj/shared.ts", text: `export const v = 1, w = 2;\n` },
    ],
  },
];

describe("equivalence — modern buildModuleGraph === frozen legacy oracle", () => {
  for (const { name, files } of FIXTURES) {
    it(name, () => {
      expectEquivalent(files);
    });
  }

  it("the oracle and modern impl actually diverge from a trivial all-empty result (harness guard)", () => {
    // Guard the proof itself: at least one fixture must produce non-empty edges/used/
    // wildcard, otherwise an all-empty pass would prove nothing.
    const big = FIXTURES.find((f) => f.name.startsWith("export forms"))!.files;
    const g = buildModuleGraph(big);
    expect([...g.imports.values()].some((e) => e.length > 0)).toBe(true);
    expect(g.wildcardUsed.size).toBeGreaterThan(0);
    expect(g.usedExports.size).toBeGreaterThan(0);
  });
});
