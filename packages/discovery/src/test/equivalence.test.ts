/**
 * THE EQUIVALENCE PROOF — differential test, modern (stub-FS Layer) vs a FROZEN
 * vendored copy of the legacy discovery functions (RULE-012 / RULE-021 / RULE-022).
 *
 * The oracle is a VERBATIM, FROZEN copy of legacy `discover-ts-project.ts:42-388`
 * (`readJsonFile`, `readTsconfig`, `resolveExtends`, `countSourceFiles`,
 * `resolveTsVersion`, `hasTypeScript`, `detectModuleSystem`, `detectBuildTool`,
 * `detectProjectKind`, `discoverTsProject`) + `computeCapabilities` (`:391-442`),
 * parameterized over a fake `{ existsSync, readFileSync, readdirSync, statSync }` backed
 * by the SAME in-memory tree the modern code reads through the stub FileSystem Layer.
 * Any difference therefore isolates to the Effect transformation — NOT to the algorithm.
 *
 * For each crafted fixture (spanning monorepo/app/lib/unknown, strict-flag combos,
 * extends chains relative/absolute/bare/missing/broken, broken package.json, .d.ts
 * exclusion, caps), we assert:
 *   - modern `discoverTsProject` result === legacy oracle (both the success ProjectInfo
 *     AND the failure: same error `_tag` + message), AND
 *   - `computeCapabilities` over each side's ProjectInfo are the SAME token set.
 *
 * `node:path` is reproduced in the oracle with the real Node `path` (POSIX on the test
 * host), matching what the modern code computes via the platform-agnostic `Path.layer`.
 * A guard pins that the oracle's path math matches the modern probed paths.
 */

import { posix as nodePath } from "node:path";
import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@ts-fix/errors-effect";
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { computeCapabilities } from "../main/capabilities.js";
import { discoverTsProject } from "../main/discover.js";
import type { ProjectInfo } from "../main/ProjectInfo.js";
import { makeTree, testLayer, UNREADABLE, type FileNode, type Tree } from "./stubFs.js";

// ===========================================================================
// FAKE node:fs over an in-memory Tree — drives the FROZEN legacy oracle below.
// `readdirSync`/`statSync`/`readFileSync` throw (like real fs) on missing/unreadable
// so the oracle's try/catch skip paths are genuinely exercised, exactly as the modern
// stub Layer's PlatformError paths are.
// ===========================================================================
const fakeFs = (tree: Tree) => {
  const childrenOf = (dir: string): string[] => {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    const names = new Set<string>();
    for (const key of tree.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.length === 0) continue;
      const slash = rest.indexOf("/");
      names.add(slash === -1 ? rest : rest.slice(0, slash));
    }
    return [...names];
  };
  const node = (p: string): FileNode | undefined => tree.get(p);
  return {
    existsSync: (p: string): boolean => tree.has(p),
    readFileSync: (p: string, _enc?: string): string => {
      const n = node(p);
      if (n?.kind === "file") return n.contents;
      throw new Error(`ENOENT/EACCES: ${p}`);
    },
    readdirSync: (p: string): string[] => {
      const n = node(p);
      if (n?.kind === "dir") return childrenOf(p);
      throw new Error(`ENOTDIR/EACCES: ${p}`);
    },
    statSync: (p: string): { isDirectory(): boolean } => {
      const n = node(p);
      if (n?.kind === "dir") return { isDirectory: () => true };
      if (n?.kind === "file") return { isDirectory: () => false };
      throw new Error(`ENOENT/EACCES: ${p}`);
    },
  };
};

// ===========================================================================
// FROZEN LEGACY ORACLE — verbatim copy of legacy/.../discover-ts-project.ts:24-442,
// parameterized over `fs` (the fake above) + `path` (node:path posix). DO NOT "fix" it.
// ===========================================================================
type FS = ReturnType<typeof fakeFs>;

const STRICT_FLAGS = [
  "strict",
  "noImplicitAny",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitThis",
  "alwaysStrict",
  "useUnknownInCatchVariables",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "noImplicitReturns",
  "noFallthroughCasesInSwitch",
  "noUnusedLocals",
  "noUnusedParameters",
] as const;

interface RawTsconfig {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
}

const legacy = (fs: FS) => {
  const { join, dirname, isAbsolute, resolve, basename } = nodePath;

  const readJsonFile = (path: string): unknown => {
    const text = fs.readFileSync(path, "utf8");
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  };

  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const resolveExtends = (fromDir: string, ext: string): string | null => {
    if (ext.startsWith(".") || isAbsolute(ext)) {
      const p = isAbsolute(ext) ? ext : resolve(fromDir, ext);
      return p.endsWith(".json") ? p : `${p}.json`;
    }
    const candidate = resolve(fromDir, "node_modules", ext);
    return candidate.endsWith(".json") ? candidate : `${candidate}.json`;
  };

  const readTsconfig = (path: string): RawTsconfig => {
    const raw = readJsonFile(path);
    if (!isObject(raw)) return {};
    const self: RawTsconfig = {
      ...(typeof raw["extends"] === "string" ? { extends: raw["extends"] } : {}),
      ...(isObject(raw["compilerOptions"])
        ? { compilerOptions: raw["compilerOptions"] }
        : {}),
    };
    if (typeof self.extends === "string") {
      const parentPath = resolveExtends(dirname(path), self.extends);
      if (parentPath !== null && fs.existsSync(parentPath)) {
        try {
          const parent = readTsconfig(parentPath);
          return {
            compilerOptions: {
              ...(parent.compilerOptions ?? {}),
              ...(self.compilerOptions ?? {}),
            },
          };
        } catch {
          /* broken parent → fall back to self */
        }
      }
    }
    return self;
  };

  const countSourceFiles = (root: string, cap = 5000): number => {
    let count = 0;
    const skip = new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      "out",
      "coverage",
      ".turbo",
    ]);
    const stack = [root];
    while (stack.length > 0 && count < cap) {
      const dir = stack.pop();
      if (dir === undefined) break;
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (skip.has(entry)) continue;
        const full = join(dir, entry);
        let s;
        try {
          s = fs.statSync(full);
        } catch {
          continue;
        }
        if (s.isDirectory()) {
          stack.push(full);
        } else if (
          (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
          !entry.endsWith(".d.ts")
        ) {
          count++;
          if (count >= cap) break;
        }
      }
    }
    return count;
  };

  const resolveTsVersion = (
    root: string,
    pkg: Record<string, unknown>,
  ): string | null => {
    const tsPkgPath = join(root, "node_modules", "typescript", "package.json");
    if (fs.existsSync(tsPkgPath)) {
      try {
        const tsPkg = readJsonFile(tsPkgPath);
        if (isObject(tsPkg) && typeof tsPkg["version"] === "string") {
          return tsPkg["version"];
        }
      } catch {
        /* fall through */
      }
    }
    const deps = {
      ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
      ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
    } as Record<string, unknown>;
    const declared = deps["typescript"];
    if (typeof declared === "string") {
      const m = declared.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
      if (m) return m[3] !== undefined ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}.0`;
    }
    return null;
  };

  const hasTypeScript = (root: string, pkg: Record<string, unknown>): boolean => {
    if (fs.existsSync(join(root, "node_modules", "typescript", "package.json"))) {
      return true;
    }
    const deps = {
      ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
      ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
    } as Record<string, unknown>;
    return typeof deps["typescript"] === "string";
  };

  const detectModuleSystem = (
    pkg: Record<string, unknown>,
    compilerOptions: Record<string, unknown>,
  ): "esm" | "cjs" => {
    if (pkg["type"] === "module") return "esm";
    if (pkg["type"] === "commonjs") return "cjs";
    const mod = compilerOptions["module"];
    if (typeof mod === "string") {
      const m = mod.toLowerCase();
      if (m.includes("commonjs") || m.includes("node16") || m.includes("nodenext")) {
        if (m.includes("commonjs")) return "cjs";
      }
      return "esm";
    }
    return "esm";
  };

  const detectBuildTool = (
    root: string,
    pkg: Record<string, unknown>,
  ): ProjectInfo["buildTool"] => {
    const scripts = isObject(pkg["scripts"]) ? pkg["scripts"] : {};
    const scriptText = Object.values(scripts)
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    const allDeps = {
      ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
      ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
    } as Record<string, unknown>;
    const has = (name: string): boolean =>
      name in allDeps ||
      scriptText.includes(name) ||
      fs.existsSync(join(root, `${name}.config.ts`)) ||
      fs.existsSync(join(root, `${name}.config.js`)) ||
      fs.existsSync(join(root, `${name}.config.mjs`));
    if (has("tsup")) return "tsup";
    if (has("vite")) return "vite";
    if (has("esbuild")) return "esbuild";
    if (has("@swc/core") || has("swc")) return "swc";
    if (has("bun")) return "bun";
    if (has("babel") || has("@babel/core")) return "babel";
    if (/\btsc\b/.test(scriptText)) return "tsc";
    return "unknown";
  };

  const detectProjectKind = (
    root: string,
    pkg: Record<string, unknown>,
  ): ProjectInfo["projectKind"] => {
    const hasWorkspaces =
      Array.isArray(pkg["workspaces"]) ||
      (isObject(pkg["workspaces"]) && Array.isArray(pkg["workspaces"]["packages"]));
    if (hasWorkspaces || fs.existsSync(join(root, "pnpm-workspace.yaml"))) {
      return "monorepo";
    }
    const hasExports =
      isObject(pkg["exports"]) || typeof pkg["exports"] === "string";
    const hasTypes =
      typeof pkg["types"] === "string" || typeof pkg["typings"] === "string";
    const hasFiles = Array.isArray(pkg["files"]);
    if (hasExports || (hasTypes && hasFiles)) return "lib";
    const scripts = isObject(pkg["scripts"]) ? pkg["scripts"] : {};
    if (pkg["bin"] !== undefined || typeof scripts["start"] === "string") {
      return "app";
    }
    return "unknown";
  };

  const discoverTsProject = (dir: string): ProjectInfo => {
    const root = resolve(dir);
    const tsconfigPath = join(root, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
      throw new TsconfigNotFoundError(
        `No tsconfig.json found in ${root}. ts-fix analyzes TypeScript projects only.`,
      );
    }
    let tsconfig: RawTsconfig;
    try {
      tsconfig = readTsconfig(tsconfigPath);
    } catch {
      tsconfig = {};
    }
    const compilerOptions = tsconfig.compilerOptions ?? {};

    const pkgPath = join(root, "package.json");
    let pkg: Record<string, unknown> = {};
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = readJsonFile(pkgPath);
        if (isObject(raw)) pkg = raw;
      } catch {
        /* broken package.json non-fatal */
      }
    }

    const sourceFileCount = countSourceFiles(root);
    const tsResolvable = hasTypeScript(root, pkg);
    if (!tsResolvable && sourceFileCount === 0) {
      throw new NoTypeScriptProjectError(
        `No resolvable 'typescript' dependency and no .ts/.tsx sources found in ${root}.`,
      );
    }

    const tsVersion = resolveTsVersion(root, pkg);
    const tsMajor = tsVersion !== null ? Number.parseInt(tsVersion, 10) : null;
    const strictFlags: Record<string, boolean> = {};
    for (const flag of STRICT_FLAGS) {
      if (compilerOptions[flag] === true) strictFlags[flag] = true;
    }
    const projectName =
      typeof pkg["name"] === "string" && (pkg["name"] as string).length > 0
        ? (pkg["name"] as string)
        : basename(root);

    return {
      rootDirectory: root,
      projectName,
      tsVersion,
      tsMajor: tsMajor !== null && Number.isFinite(tsMajor) ? tsMajor : null,
      projectKind: detectProjectKind(root, pkg),
      moduleSystem: detectModuleSystem(pkg, compilerOptions),
      buildTool: detectBuildTool(root, pkg),
      strictFlags,
      typecheckOk: false,
      sourceFileCount,
    };
  };

  const moduleResolutionToken = (info: ProjectInfo): string | null =>
    info.moduleSystem === "esm"
      ? "moduleResolution:bundler"
      : "moduleResolution:node";

  const computeCapabilitiesLegacy = (info: ProjectInfo): Set<string> => {
    const caps = new Set<string>();
    caps.add("tsconfig");
    if (info.tsVersion !== null) {
      const m = info.tsVersion.match(/^(\d+)\.(\d+)/);
      if (m) caps.add(`ts:${m[1]}.${m[2]}`);
    }
    for (const [flag, on] of Object.entries(info.strictFlags)) {
      if (on) caps.add(flag);
    }
    caps.add(info.moduleSystem);
    const modRes = moduleResolutionToken(info);
    if (modRes !== null) caps.add(modRes);
    if (info.projectKind !== "unknown") caps.add(info.projectKind);
    if (info.buildTool !== "unknown") caps.add(`build:${info.buildTool}`);
    if (info.typecheckOk) caps.add("typecheck:ok");
    return caps;
  };

  return { discoverTsProject, computeCapabilitiesLegacy };
};

// ===========================================================================
// Run the MODERN discovery (stub FS Layer), returning the Either.
// ===========================================================================
const runModern = (
  dir: string,
  tree: Tree,
): Promise<
  Either.Either<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError>
> =>
  Effect.runPromise(
    discoverTsProject(dir).pipe(Effect.either, Effect.provide(testLayer(tree))),
  );

/** Run the FROZEN oracle, normalizing its throw into the same Either shape. */
const runOracle = (
  dir: string,
  tree: Tree,
): Either.Either<ProjectInfo, { _tag: string; message: string }> => {
  const { discoverTsProject: oracle } = legacy(fakeFs(tree));
  try {
    return Either.right(oracle(dir));
  } catch (e) {
    const err = e as { _tag?: string; message?: string };
    return Either.left({ _tag: err._tag ?? "", message: err.message ?? "" });
  }
};

// ===========================================================================
// CRAFTED FIXTURES — every branch class.
// ===========================================================================
const TS = "5.8.2"; // installed typescript version used across fixtures
const tsPkg = JSON.stringify({ version: TS });

const fixtures: ReadonlyArray<{
  name: string;
  dir: string;
  entries: Record<string, string | typeof UNREADABLE>;
}> = [
  {
    name: "no tsconfig → TsconfigNotFoundError",
    dir: "/p",
    entries: { "/p/package.json": "{}" },
  },
  {
    name: "tsconfig but no TS and no sources → NoTypeScriptProjectError",
    dir: "/p",
    entries: { "/p/tsconfig.json": "{}", "/p/package.json": "{}" },
  },
  {
    name: "minimal lib (installed ts, exports, esm, strict)",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/package.json": JSON.stringify({
        name: "lib-x",
        type: "module",
        exports: { ".": "./i.js" },
        devDependencies: { typescript: "^5.8.0" },
      }),
      "/p/src/a.ts": "",
      "/p/src/b.tsx": "",
      "/p/src/types.d.ts": "",
    },
  },
  {
    name: "app (bin), cjs (tsconfig module commonjs), tsc build, no strict",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        compilerOptions: { module: "CommonJS" },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/package.json": JSON.stringify({
        name: "app-x",
        bin: { cli: "./c.js" },
        scripts: { build: "tsc" },
      }),
      "/p/index.ts": "",
    },
  },
  {
    name: "monorepo (pnpm-workspace.yaml), vite via config file",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, noUncheckedIndexedAccess: true },
      }),
      "/p/pnpm-workspace.yaml": "packages:\n  - p/*",
      "/p/vite.config.ts": "",
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/package.json": JSON.stringify({ name: "mono" }),
      "/p/packages/a/src/x.ts": "",
    },
  },
  {
    name: "unknown kind, swc build, declared (not installed) ts version range",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": "{}",
      "/p/package.json": JSON.stringify({
        devDependencies: { typescript: "~4.9", "@swc/core": "1.0.0" },
      }),
      "/p/main.ts": "",
    },
  },
  {
    name: "extends relative chain (child wins) + comments + trailing commas",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": `{
        // root
        "extends": "./tsconfig.base.json",
        "compilerOptions": { "strict": true, },
      }`,
      "/p/tsconfig.base.json": JSON.stringify({
        compilerOptions: { noImplicitAny: true, strict: false },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/package.json": JSON.stringify({ name: "ext-rel" }),
      "/p/a.ts": "",
    },
  },
  {
    name: "extends absolute",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({ extends: "/shared/base.json" }),
      "/shared/base.json": JSON.stringify({
        compilerOptions: { alwaysStrict: true },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "extends bare-package under node_modules",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        extends: "@tsconfig/strictest/tsconfig.json",
      }),
      "/p/node_modules/@tsconfig/strictest/tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, exactOptionalPropertyTypes: true },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "extends missing parent (falls back to self)",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        extends: "./nope.json",
        compilerOptions: { strict: true },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "extends broken parent (falls back to self)",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        extends: "./broken.json",
        compilerOptions: { noUnusedLocals: true },
      }),
      "/p/broken.json": "{ not json ,,",
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "broken package.json (non-fatal) → basename name",
    dir: "/repo/myproj",
    entries: {
      "/repo/myproj/tsconfig.json": "{}",
      "/repo/myproj/package.json": "{ broken",
      "/repo/myproj/a.ts": "",
    },
  },
  {
    name: "unreadable source dir skipped, still discovers",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": "{}",
      "/p/keep.ts": "",
      "/p/secret": UNREADABLE,
    },
  },
  {
    name: "all 15 strict flags ON",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        compilerOptions: {
          strict: true,
          noImplicitAny: true,
          strictNullChecks: true,
          strictFunctionTypes: true,
          strictBindCallApply: true,
          strictPropertyInitialization: true,
          noImplicitThis: true,
          alwaysStrict: true,
          useUnknownInCatchVariables: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
        },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "non-true strict flag values ignored (1, 'true', null)",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": JSON.stringify({
        compilerOptions: {
          strict: 1,
          noImplicitAny: "true",
          strictNullChecks: null,
          alwaysStrict: true,
        },
      }),
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/a.ts": "",
    },
  },
  {
    name: "lib via types+files; babel build; cjs via package type",
    dir: "/p",
    entries: {
      "/p/tsconfig.json": "{}",
      "/p/node_modules/typescript/package.json": tsPkg,
      "/p/package.json": JSON.stringify({
        name: "lib2",
        type: "commonjs",
        types: "./d.ts",
        files: ["dist"],
        devDependencies: { "@babel/core": "7" },
      }),
      "/p/a.ts": "",
    },
  },
];

// Guard: the oracle's path math (node:path posix) reproduces the paths the modern code
// probes via the platform-agnostic Path.layer, so both sides agree on the SAME tree keys
// (else a parity pass could be vacuous on a wrong-but-matching key).
describe("EQUIVALENCE — oracle path-math guard", () => {
  it("node:path posix join/resolve reproduces the modern probed tsconfig path", () => {
    expect(nodePath.join(nodePath.resolve("/p"), "tsconfig.json")).toBe(
      "/p/tsconfig.json",
    );
    expect(nodePath.resolve("/repo/myproj")).toBe("/repo/myproj");
  });
});

describe("EQUIVALENCE — modern discovery (stub FS) deep-equals frozen legacy oracle", () => {
  for (const { name, dir, entries } of fixtures) {
    it(`parity: ${name}`, async () => {
      const tree = makeTree(entries);
      const modern = await runModern(dir, tree);
      const oracle = runOracle(dir, tree);

      // Same Left/Right disposition.
      expect(Either.isLeft(modern)).toBe(Either.isLeft(oracle));

      if (Either.isLeft(modern) && Either.isLeft(oracle)) {
        // Same error tag + verbatim message.
        expect(modern.left._tag).toBe(oracle.left._tag);
        expect(modern.left.message).toBe(oracle.left.message);
        return;
      }

      if (Either.isRight(modern) && Either.isRight(oracle)) {
        // Same ProjectInfo, field-for-field.
        expect(modern.right).toStrictEqual(oracle.right);
        // And the same capability token set over each side's ProjectInfo.
        const { computeCapabilitiesLegacy } = legacy(fakeFs(tree));
        const modernCaps = [...computeCapabilities(modern.right)].sort();
        const oracleCaps = [...computeCapabilitiesLegacy(oracle.right)].sort();
        expect(modernCaps).toEqual(oracleCaps);
      }
    });
  }
});

// ===========================================================================
// computeCapabilities equivalence over synthetic ProjectInfos (decoupled from discovery)
// ===========================================================================
describe("EQUIVALENCE — computeCapabilities matches the frozen legacy oracle", () => {
  const infos: ProjectInfo[] = [
    {
      rootDirectory: "/p",
      projectName: "p",
      tsVersion: "5.8.2",
      tsMajor: 5,
      projectKind: "monorepo",
      moduleSystem: "esm",
      buildTool: "vite",
      strictFlags: { strict: true, noUncheckedIndexedAccess: true },
      typecheckOk: false,
      sourceFileCount: 3,
    },
    {
      rootDirectory: "/q",
      projectName: "q",
      tsVersion: null,
      tsMajor: null,
      projectKind: "unknown",
      moduleSystem: "cjs",
      buildTool: "unknown",
      strictFlags: {},
      typecheckOk: false,
      sourceFileCount: 0,
    },
    {
      rootDirectory: "/r",
      projectName: "r",
      tsVersion: "4.9.5",
      tsMajor: 4,
      projectKind: "app",
      moduleSystem: "cjs",
      buildTool: "tsc",
      strictFlags: { alwaysStrict: true },
      typecheckOk: true, // exercise the typecheck:ok token path (engine-reconciled)
      sourceFileCount: 7,
    },
  ];

  const { computeCapabilitiesLegacy } = legacy(fakeFs(makeTree({})));

  for (const [i, info] of infos.entries()) {
    it(`caps parity #${i} (${info.projectKind}/${info.moduleSystem})`, () => {
      expect([...computeCapabilities(info)].sort()).toEqual(
        [...computeCapabilitiesLegacy(info)].sort(),
      );
    });
  }
});
