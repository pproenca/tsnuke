/**
 * Characterization tests for `enumerateWorkspaceProjects` (`src/main/workspace.ts`) — the
 * monorepo-discovery walk that wires the dormant BC-05 min-score path. Runs against the
 * in-memory `FileSystem` + real `Path` Layer (NO real disk; see `stubFs.ts`).
 *
 * Covers: pnpm-workspace.yaml `packages:` block + inline forms; package.json#workspaces
 * (array + object); `*` / `**` / partial / exact globs; tsconfig.json gating; negation
 * excludes; not-a-workspace → []; deterministic sort.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  enumerateWorkspaceProjects,
  parsePnpmWorkspacePackages,
} from "../main/workspace.js";
import { makeTree, testLayer, type Tree } from "./stubFs.js";

const run = (dir: string, tree: Tree): Promise<ReadonlyArray<string>> =>
  Effect.runPromise(
    enumerateWorkspaceProjects(dir).pipe(Effect.provide(testLayer(tree))),
  );

describe("parsePnpmWorkspacePackages", () => {
  it("reads the block form, skipping comments + the next top-level key", () => {
    const yaml = [
      "packages:",
      '  - "packages/*"',
      "  # a comment",
      "  - examples/*",
      "allowBuilds:",
      "  esbuild: true",
    ].join("\n");
    expect(parsePnpmWorkspacePackages(yaml)).toStrictEqual(["packages/*", "examples/*"]);
  });

  it("reads the inline-array form", () => {
    expect(parsePnpmWorkspacePackages('packages: ["packages/*", "apps/*"]')).toStrictEqual([
      "packages/*",
      "apps/*",
    ]);
  });

  it("returns [] when there is no packages: key", () => {
    expect(parsePnpmWorkspacePackages("allowBuilds:\n  esbuild: true")).toStrictEqual([]);
  });
});

describe("enumerateWorkspaceProjects — pnpm workspace", () => {
  it("finds member dirs with a tsconfig.json, sorted; skips members without one", async () => {
    const tree = makeTree({
      "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "/ws/packages/b/tsconfig.json": "{}",
      "/ws/packages/a/tsconfig.json": "{}",
      "/ws/packages/no-ts/package.json": "{}", // no tsconfig → excluded
    });
    expect(await run("/ws", tree)).toStrictEqual([
      "/ws/packages/a",
      "/ws/packages/b",
    ]);
  });

  it("expands multiple globs (packages/* + examples/*)", async () => {
    const tree = makeTree({
      "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "examples/*"\n',
      "/ws/packages/cli/tsconfig.json": "{}",
      "/ws/examples/demo/tsconfig.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual([
      "/ws/examples/demo",
      "/ws/packages/cli",
    ]);
  });

  it("honors negation excludes", async () => {
    const tree = makeTree({
      "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "!packages/internal"\n',
      "/ws/packages/keep/tsconfig.json": "{}",
      "/ws/packages/internal/tsconfig.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual(["/ws/packages/keep"]);
  });

  it("supports ** (all descendants)", async () => {
    const tree = makeTree({
      "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/**"\n',
      "/ws/packages/group/nested/tsconfig.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual(["/ws/packages/group/nested"]);
  });
});

describe("enumerateWorkspaceProjects — package.json workspaces", () => {
  it("reads the array form", async () => {
    const tree = makeTree({
      "/ws/package.json": JSON.stringify({ workspaces: ["pkgs/*"] }),
      "/ws/pkgs/one/tsconfig.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual(["/ws/pkgs/one"]);
  });

  it("reads the object form ({ packages: [...] })", async () => {
    const tree = makeTree({
      "/ws/package.json": JSON.stringify({ workspaces: { packages: ["pkgs/*"] } }),
      "/ws/pkgs/one/tsconfig.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual(["/ws/pkgs/one"]);
  });
});

describe("enumerateWorkspaceProjects — non-workspace", () => {
  it("returns [] when there is no workspace manifest", async () => {
    const tree = makeTree({ "/p/tsconfig.json": "{}", "/p/package.json": "{}" });
    expect(await run("/p", tree)).toStrictEqual([]);
  });

  it("returns [] when a workspace has no TS members", async () => {
    const tree = makeTree({
      "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "/ws/packages/a/package.json": "{}",
    });
    expect(await run("/ws", tree)).toStrictEqual([]);
  });
});
