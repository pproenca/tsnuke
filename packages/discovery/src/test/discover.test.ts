/**
 * Characterization tests for `discoverTsProject` (`src/main/discover.ts`, RULE-022 +
 * RULE-021 inputs). Runs against an in-memory `FileSystem` + real `Path` Layer (NO real
 * disk; see `stubFs.ts`). The legacy `throw`s become the Effect ERROR CHANNEL —
 * asserted via `Effect.either` (a failure → `Left<E>`, a success → `Right<ProjectInfo>`).
 *
 * Covers: tsconfig-missing → `TsconfigNotFoundError`; no-TS → `NoTypeScriptProjectError`;
 * broken package.json non-fatal; lenient tsconfig parse (comments + trailing commas);
 * `extends` one-level relative/absolute/bare-package; `.d.ts` excluded from the source
 * count; strict-flag extraction; version/module/build/kind detection; the PENDING
 * `typecheckOk: false` hardcode.
 */

import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@ts-doctor/errors-effect";
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { discoverTsProject } from "../main/discover.js";
import type { ProjectInfo } from "../main/ProjectInfo.js";
import { makeTree, testLayer, type Tree } from "./stubFs.js";

/** Run discovery; return the `Either` (Left = the typed error channel, Right = ProjectInfo). */
const run = (
  dir: string,
  tree: Tree,
): Promise<Either.Either<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError>> =>
  Effect.runPromise(discoverTsProject(dir).pipe(Effect.either, Effect.provide(testLayer(tree))));

/** Run discovery and assert success, returning the ProjectInfo. */
const runOk = async (dir: string, tree: Tree): Promise<ProjectInfo> => {
  const res = await run(dir, tree);
  if (Either.isLeft(res)) throw new Error(`expected success, got ${res.left._tag}`);
  return res.right;
};

// ===========================================================================
// RULE-022 — validity gates (errors on the Effect error channel)
// ===========================================================================
describe("discoverTsProject — RULE-022 validity", () => {
  it("FAILS with TsconfigNotFoundError when no tsconfig.json", async () => {
    const res = await run("/p", makeTree({ "/p/package.json": "{}" }));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(TsconfigNotFoundError);
      expect(res.left._tag).toBe("TsconfigNotFoundError");
      expect(res.left.message).toBe(
        "No tsconfig.json found in /p. ts-doctor analyzes TypeScript projects only.",
      );
    }
  });

  it("FAILS with NoTypeScriptProjectError when TS not resolvable AND zero sources", async () => {
    const res = await run(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/package.json": "{}" }),
    );
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(NoTypeScriptProjectError);
      expect(res.left._tag).toBe("NoTypeScriptProjectError");
      expect(res.left.message).toBe(
        "No resolvable 'typescript' dependency and no .ts/.tsx sources found in /p.",
      );
    }
  });

  it("SUCCEEDS when TS not resolvable BUT at least one .ts source exists", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/src/a.ts": "" }),
    );
    expect(info.sourceFileCount).toBe(1);
    expect(info.tsVersion).toBeNull();
  });

  it("SUCCEEDS when typescript is a declared devDep even with zero sources", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ devDependencies: { typescript: "^5.8.0" } }),
      }),
    );
    expect(info.tsVersion).toBe("5.8.0");
    expect(info.tsMajor).toBe(5);
  });

  it("SUCCEEDS when typescript is INSTALLED in node_modules (authoritative version)", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/node_modules/typescript/package.json": JSON.stringify({ version: "5.4.5" }),
        "/p/package.json": JSON.stringify({ devDependencies: { typescript: "^5.8.0" } }),
      }),
    );
    // Installed version wins over the declared range.
    expect(info.tsVersion).toBe("5.4.5");
  });
});

// ===========================================================================
// package.json non-fatal handling (RULE-022)
// ===========================================================================
describe("discoverTsProject — broken/missing package.json is non-fatal", () => {
  it("missing package.json → defaults (projectName = basename)", async () => {
    const info = await runOk(
      "/repo/myproj",
      makeTree({ "/repo/myproj/tsconfig.json": "{}", "/repo/myproj/a.ts": "" }),
    );
    expect(info.projectName).toBe("myproj");
    expect(info.projectKind).toBe("unknown");
    expect(info.buildTool).toBe("unknown");
  });

  it("unparseable package.json → non-fatal, continues with defaults", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": "{ this is not json",
        "/p/a.ts": "",
      }),
    );
    expect(info.projectName).toBe("p"); // basename fallback
  });

  it("package.json that is a JSON array (non-object) → defaults", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify([1, 2, 3]),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectName).toBe("p");
  });

  it("uses package.json#name when present and non-empty", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ name: "@scope/cool" }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectName).toBe("@scope/cool");
  });
});

// ===========================================================================
// Lenient tsconfig parse + strict-flag extraction (RULE-022 / RULE-021)
// ===========================================================================
describe("discoverTsProject — lenient tsconfig parse", () => {
  it("strips // line comments, /* block */ comments, and trailing commas", async () => {
    const tsconfig = `{
      // leading line comment
      "compilerOptions": {
        /* block comment */
        "strict": true,
        "noUncheckedIndexedAccess": true, // trailing comment
      },
    }`;
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": tsconfig, "/p/a.ts": "" }),
    );
    expect(info.strictFlags).toEqual({ strict: true, noUncheckedIndexedAccess: true });
  });

  it("only records strict flags that are === true (not 'true' string, not 1)", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": JSON.stringify({
          compilerOptions: { strict: true, noImplicitAny: false, alwaysStrict: 1 },
        }),
        "/p/a.ts": "",
      }),
    );
    expect(info.strictFlags).toEqual({ strict: true });
  });

  it("an unparseable tsconfig → treated as empty compilerOptions (non-fatal, still discovers)", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{ broken", "/p/a.ts": "" }),
    );
    expect(info.strictFlags).toEqual({});
  });
});

// ===========================================================================
// extends resolution — one level shallow (RULE-022)
// ===========================================================================
describe("discoverTsProject — extends (one level, relative/absolute/bare)", () => {
  it("relative extends merges parent compilerOptions; child wins on conflict", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({
        extends: "./tsconfig.base.json",
        compilerOptions: { strict: true },
      }),
      "/p/tsconfig.base.json": JSON.stringify({
        compilerOptions: { noUncheckedIndexedAccess: true, strict: false },
      }),
      "/p/a.ts": "",
    });
    const info = await runOk("/p", tree);
    // parent's noUncheckedIndexedAccess kept; child's strict:true overrides parent's false.
    expect(info.strictFlags).toEqual({ strict: true, noUncheckedIndexedAccess: true });
  });

  it("relative extends WITHOUT .json suffix gets .json appended", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({ extends: "./base" }),
      "/p/base.json": JSON.stringify({ compilerOptions: { strict: true } }),
      "/p/a.ts": "",
    });
    expect((await runOk("/p", tree)).strictFlags).toEqual({ strict: true });
  });

  it("absolute extends path is resolved as-is", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({ extends: "/shared/tsconfig.json" }),
      "/shared/tsconfig.json": JSON.stringify({ compilerOptions: { alwaysStrict: true } }),
      "/p/a.ts": "",
    });
    expect((await runOk("/p", tree)).strictFlags).toEqual({ alwaysStrict: true });
  });

  it("bare-package extends resolves under node_modules", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({
        extends: "@tsconfig/strictest/tsconfig.json",
      }),
      "/p/node_modules/@tsconfig/strictest/tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, exactOptionalPropertyTypes: true },
      }),
      "/p/a.ts": "",
    });
    expect((await runOk("/p", tree)).strictFlags).toEqual({
      strict: true,
      exactOptionalPropertyTypes: true,
    });
  });

  it("a MISSING extends parent never crashes discovery (falls back to self)", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({
        extends: "./does-not-exist.json",
        compilerOptions: { strict: true },
      }),
      "/p/a.ts": "",
    });
    expect((await runOk("/p", tree)).strictFlags).toEqual({ strict: true });
  });

  it("a BROKEN extends parent never crashes discovery (falls back to self compilerOptions)", async () => {
    const tree = makeTree({
      "/p/tsconfig.json": JSON.stringify({
        extends: "./broken.json",
        compilerOptions: { strict: true },
      }),
      "/p/broken.json": "{ not json",
      "/p/a.ts": "",
    });
    // Parent unparseable → readTsconfig(parent) = {} → merge keeps child's strict:true.
    expect((await runOk("/p", tree)).strictFlags).toEqual({ strict: true });
  });
});

// ===========================================================================
// detection: module system / build tool / project kind / version (RULE-021 inputs)
// ===========================================================================
describe("discoverTsProject — module system detection", () => {
  it('package.json type:"module" → esm', async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ type: "module" }),
        "/p/a.ts": "",
      }),
    );
    expect(info.moduleSystem).toBe("esm");
  });

  it('package.json type:"commonjs" → cjs', async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ type: "commonjs" }),
        "/p/a.ts": "",
      }),
    );
    expect(info.moduleSystem).toBe("cjs");
  });

  it('tsconfig module:"CommonJS" (no package type) → cjs', async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": JSON.stringify({ compilerOptions: { module: "CommonJS" } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.moduleSystem).toBe("cjs");
  });

  it('tsconfig module:"NodeNext" → esm (node16/nodenext lean esm)', async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.moduleSystem).toBe("esm");
  });

  it("no signals → esm default", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/a.ts": "" }),
    );
    expect(info.moduleSystem).toBe("esm");
  });
});

describe("discoverTsProject — build tool detection (precedence)", () => {
  it("tsup dep beats vite/tsc (precedence order)", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({
          devDependencies: { tsup: "1", vite: "1" },
          scripts: { build: "tsc" },
        }),
        "/p/a.ts": "",
      }),
    );
    expect(info.buildTool).toBe("tsup");
  });

  it("vite via a vite.config.ts file (config-file detection)", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/vite.config.ts": "",
        "/p/a.ts": "",
      }),
    );
    expect(info.buildTool).toBe("vite");
  });

  it("swc via @swc/core dep", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ devDependencies: { "@swc/core": "1" } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.buildTool).toBe("swc");
  });

  it('tsc via a script containing the word "tsc"', async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ scripts: { build: "tsc -p ." } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.buildTool).toBe("tsc");
  });

  it("nothing → unknown", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/a.ts": "" }),
    );
    expect(info.buildTool).toBe("unknown");
  });
});

describe("discoverTsProject — project kind detection (heuristics + order)", () => {
  it("monorepo via workspaces array", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ workspaces: ["packages/*"] }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("monorepo");
  });

  it("monorepo via pnpm-workspace.yaml", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/pnpm-workspace.yaml": "packages:\n  - pkg/*",
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("monorepo");
  });

  it("lib via exports map", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ exports: { ".": "./index.js" } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("lib");
  });

  it("lib via types + files together", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ types: "./d.ts", files: ["dist"] }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("lib");
  });

  it("app via bin", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ bin: { mycli: "./cli.js" } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("app");
  });

  it("app via start script", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({ scripts: { start: "node ." } }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("app");
  });

  it("monorepo wins over lib (order: workspaces present AND exports present)", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/package.json": JSON.stringify({
          workspaces: ["a/*"],
          exports: { ".": "./i.js" },
        }),
        "/p/a.ts": "",
      }),
    );
    expect(info.projectKind).toBe("monorepo");
  });

  it("nothing → unknown", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/a.ts": "" }),
    );
    expect(info.projectKind).toBe("unknown");
  });
});

// ===========================================================================
// source count (.d.ts excluded) + PENDING typecheckOk (RULE-021)
// ===========================================================================
describe("discoverTsProject — sourceFileCount + typecheckOk PENDING", () => {
  it(".d.ts files do NOT count toward sourceFileCount", async () => {
    const info = await runOk(
      "/p",
      makeTree({
        "/p/tsconfig.json": "{}",
        "/p/a.ts": "",
        "/p/b.tsx": "",
        "/p/types.d.ts": "",
      }),
    );
    expect(info.sourceFileCount).toBe(2);
  });

  it("typecheckOk is ALWAYS false from discovery (PENDING — engine reconciles)", async () => {
    const info = await runOk(
      "/p",
      makeTree({ "/p/tsconfig.json": "{}", "/p/a.ts": "" }),
    );
    expect(info.typecheckOk).toBe(false);
  });

  it("rootDirectory is the resolved absolute path of the input dir", async () => {
    const info = await runOk(
      "/repo/pkg",
      makeTree({ "/repo/pkg/tsconfig.json": "{}", "/repo/pkg/a.ts": "" }),
    );
    expect(info.rootDirectory).toBe("/repo/pkg");
  });
});
