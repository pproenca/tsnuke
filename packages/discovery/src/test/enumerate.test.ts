/**
 * Characterization tests for source-file enumeration (`src/main/enumerate.ts`,
 * RULE-012). Runs the walkers against an in-memory `FileSystem` Layer (NO real disk;
 * see `stubFs.ts`). Covers: caps (count 5000 / collect 10000), `.d.ts` exclusion, BOTH
 * ignore-dir sets (count vs collect — collect adds `.next` + `storybook-static` + skips
 * dot-entries), nested DFS, and unreadable-dir/failed-stat skip.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { collectSourceFiles, countSourceFiles } from "../main/enumerate.js";
import { makeTree, testLayer, UNREADABLE, type Tree } from "./stubFs.js";

const runCount = (root: string, tree: Tree, cap?: number): Promise<number> =>
  Effect.runPromise(
    (cap === undefined ? countSourceFiles(root) : countSourceFiles(root, cap)).pipe(
      Effect.provide(testLayer(tree)),
    ),
  );

const runCollect = (
  root: string,
  tree: Tree,
  cap?: number,
): Promise<ReadonlyArray<string>> =>
  Effect.runPromise(
    (cap === undefined ? collectSourceFiles(root) : collectSourceFiles(root, cap)).pipe(
      Effect.provide(testLayer(tree)),
    ),
  );

// ===========================================================================
// RULE-012 cap TRUNCATION — the one order-sensitive, score-gating behavior.
// The default-cap path (5000/10000) is impractical to hit in a test, so we inject a
// small cap over a >cap tree to pin "stop AT the cap" for both walkers. Truncation at
// the cap was previously untested (architecture review H1); the real-readdir-order
// version lives in node.test.ts.
// ===========================================================================
describe("cap truncation (RULE-012)", () => {
  const big = makeTree({
    "/p/a.ts": "",
    "/p/b.ts": "",
    "/p/c.ts": "",
    "/p/d.ts": "",
    "/p/e.ts": "",
  });

  it("countSourceFiles stops AT the cap when the tree exceeds it (5 files, cap 3 → 3)", async () => {
    expect(await runCount("/p", big, 3)).toBe(3);
  });

  it("countSourceFiles returns the true count when under the cap (5 files, cap 10 → 5)", async () => {
    expect(await runCount("/p", big, 10)).toBe(5);
  });

  it("collectSourceFiles truncates the collected list to the cap (5 files, cap 2 → length 2)", async () => {
    expect((await runCollect("/p", big, 2)).length).toBe(2);
  });

  it("collectSourceFiles returns all when under the cap (5 files, cap 10 → length 5)", async () => {
    expect((await runCollect("/p", big, 10)).length).toBe(5);
  });
});

// ===========================================================================
// countSourceFiles — RULE-012 (cap 5000; count ignore set)
// ===========================================================================
describe("countSourceFiles", () => {
  it("counts .ts and .tsx; excludes .d.ts; ignores non-TS files", async () => {
    const tree = makeTree({
      "/p/a.ts": "",
      "/p/b.tsx": "",
      "/p/c.d.ts": "",
      "/p/d.js": "",
      "/p/readme.md": "",
    });
    expect(await runCount("/p", tree)).toBe(2);
  });

  it("recurses (iterative DFS) into nested directories", async () => {
    const tree = makeTree({
      "/p/src/a.ts": "",
      "/p/src/deep/nested/b.tsx": "",
      "/p/src/deep/c.ts": "",
    });
    expect(await runCount("/p", tree)).toBe(3);
  });

  it("skips the COUNT ignore set: node_modules/.git/dist/build/out/coverage/.turbo", async () => {
    const tree = makeTree({
      "/p/keep.ts": "",
      "/p/node_modules/x.ts": "",
      "/p/.git/y.ts": "",
      "/p/dist/d.ts": "",
      "/p/build/b.ts": "",
      "/p/out/o.ts": "",
      "/p/coverage/c.ts": "",
      "/p/.turbo/t.ts": "",
    });
    expect(await runCount("/p", tree)).toBe(1);
  });

  it("DOES walk .next and storybook-static (they are NOT in the count ignore set — the two-set quirk)", async () => {
    const tree = makeTree({
      "/p/.next/page.ts": "",
      "/p/storybook-static/s.ts": "",
    });
    // count's smaller ignore set means these ARE counted (unlike collect).
    expect(await runCount("/p", tree)).toBe(2);
  });

  it("DOES walk dot-dirs other than ignored ones (count does NOT skip dot-entries)", async () => {
    const tree = makeTree({ "/p/.config/x.ts": "" });
    expect(await runCount("/p", tree)).toBe(1);
  });

  it("truncates silently at the cap", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`/p/f${i}.ts`] = "";
    expect(await runCount("/p", makeTree(files), 4)).toBe(4);
  });

  it("skips an unreadable directory (failed readDirectory) and keeps walking", async () => {
    const tree = makeTree({
      "/p/keep.ts": "",
      "/p/secret": UNREADABLE,
    });
    expect(await runCount("/p", tree)).toBe(1);
  });

  it("empty / nonexistent root → 0 (failed readDirectory on root is skipped)", async () => {
    expect(await runCount("/nope", makeTree({}))).toBe(0);
  });
});

// ===========================================================================
// collectSourceFiles — RULE-012 (cap 10000; LARGER ignore set + dot-skip)
// ===========================================================================
describe("collectSourceFiles", () => {
  it("collects absolute .ts/.tsx paths; excludes .d.ts", async () => {
    const tree = makeTree({
      "/p/a.ts": "",
      "/p/b.tsx": "",
      "/p/c.d.ts": "",
    });
    const out = await runCollect("/p", tree);
    expect([...out].sort()).toEqual(["/p/a.ts", "/p/b.tsx"]);
  });

  it("skips the COLLECT ignore set INCLUDING .next and storybook-static (the extra two)", async () => {
    const tree = makeTree({
      "/p/keep.ts": "",
      "/p/node_modules/x.ts": "",
      "/p/.next/n.ts": "",
      "/p/storybook-static/s.ts": "",
      "/p/dist/d.ts": "",
      "/p/.turbo/t.ts": "",
    });
    const out = await runCollect("/p", tree);
    expect([...out]).toEqual(["/p/keep.ts"]);
  });

  it("skips ANY dot-entry (collect skips entries starting with '.'; count does not)", async () => {
    const tree = makeTree({
      "/p/keep.ts": "",
      "/p/.config/x.ts": "",
      "/p/.hidden.ts": "",
    });
    const out = await runCollect("/p", tree);
    expect([...out]).toEqual(["/p/keep.ts"]);
  });

  it("recurses iteratively into nested dirs", async () => {
    const tree = makeTree({
      "/p/src/a.ts": "",
      "/p/src/deep/b.tsx": "",
    });
    const out = await runCollect("/p", tree);
    expect([...out].sort()).toEqual(["/p/src/a.ts", "/p/src/deep/b.tsx"]);
  });

  it("truncates silently at the (higher) cap", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) files[`/p/f${i}.ts`] = "";
    const out = await runCollect("/p", makeTree(files), 5);
    expect(out.length).toBe(5);
  });

  it("skips an unreadable directory and keeps walking", async () => {
    const tree = makeTree({
      "/p/keep.ts": "",
      "/p/secret": UNREADABLE,
    });
    const out = await runCollect("/p", tree);
    expect([...out]).toEqual(["/p/keep.ts"]);
  });
});

// ===========================================================================
// The two-set / two-cap INCONSISTENCY pinned side-by-side (RULE-012 suspected defect)
// ===========================================================================
describe("RULE-012 quirk — count vs collect divergence is preserved", () => {
  it(".next + storybook-static: counted by count, EXCLUDED by collect", async () => {
    const tree = makeTree({
      "/p/.next/n.ts": "",
      "/p/storybook-static/s.ts": "",
      "/p/keep.ts": "",
    });
    expect(await runCount("/p", tree)).toBe(3); // count walks them
    const collected = await runCollect("/p", tree);
    expect([...collected]).toEqual(["/p/keep.ts"]); // collect skips them
  });

  it("default caps differ (count 5000 / collect 10000) — exported constants", async () => {
    const { COUNT_CAP, COLLECT_CAP } = await import("../main/enumerate.js");
    expect(COUNT_CAP).toBe(5000);
    expect(COLLECT_CAP).toBe(10000);
  });
});
