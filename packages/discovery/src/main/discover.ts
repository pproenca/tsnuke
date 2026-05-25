/**
 * Project discovery over the `@effect/platform` `FileSystem` + `Path` services
 * (RULE-022: project discovery validity). Source of truth (READ-ONLY):
 * `legacy/ts-fix/packages/core/src/discover-ts-project.ts:24-388` (the strict-flag
 * family, JSON/`extends` helpers, version/module/build/kind detection, and
 * `discoverTsProject`).
 *
 * `discoverTsProject(dir)` reads `tsconfig.json` (resolving `extends` ONE level
 * shallow) and `package.json` to produce a {@link ProjectInfo}, refusing non-TS
 * projects. The legacy function `throw`s `TsconfigNotFoundError` / `NoTypeScriptProjectError`;
 * here those typed errors (imported from `@ts-fix/errors-effect`) move to the Effect
 * ERROR CHANNEL — the idiomatic Effect replacement for `throw`. NON-fatal cases (a
 * broken/unreadable `package.json`) stay SUCCESSES with defaults, exactly as legacy
 * continued past its `try/catch`.
 *
 *   discoverTsProject(dir):
 *     Effect<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError,
 *            FileSystem | Path>
 *
 * All I/O goes through the `FileSystem`/`Path` SERVICE INTERFACES (not `node:fs`/
 * `node:path`), satisfied by a Layer at the edge (Node in prod, in-memory stub in
 * tests) — the inversion every effectful slice reuses.
 *
 * PRESERVED QUIRK (RULE-021): discovery HARDCODES `typecheckOk: false` ("PENDING").
 * Discovery does NOT type-check; the engine reconciles the real value later from a
 * `ts.Program`. Not computed here — flagged as a follow-up in TRANSFORMATION_NOTES.
 */

import { FileSystem, Path } from "@effect/platform";
import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@ts-fix/errors-effect";
import { Effect, Either } from "effect";
import { countSourceFiles } from "./enumerate.js";
import type { BuildTool, ModuleSystem, ProjectInfo, ProjectKind } from "./ProjectInfo.js";

/**
 * Strict-family tsconfig flags surfaced as capability tokens (RULE-021, 15 members).
 * Legacy `STRICT_FLAGS` (`discover-ts-project.ts:24-40`) — order preserved.
 */
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

/** Is this a plain (non-array, non-null) object? Mirrors legacy `isObject` (`:58-60`). */
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * LENIENT JSON parse (legacy `readJsonFile`, `discover-ts-project.ts:47-56`): strip
 * block comments, line comments, and trailing commas, then `JSON.parse`. Tolerates the
 * comments/trailing commas commonly found in `tsconfig.json`.
 *
 * Returns the parsed value, or `undefined` when the file is unreadable
 * (`PlatformError`) OR the text fails to parse (`JSON.parse` throw). Legacy let the
 * `JSON.parse` throw propagate to the CALLER's `try/catch`; here both the read-failure
 * and the parse-failure collapse to `undefined`, and each caller decides what an
 * `undefined` means (a missing/broken tsconfig → `{}`; a broken package.json →
 * defaults). Error channel `never` — the parse never fails the Effect.
 */
const readJsonFile = (
  path: string,
): Effect.Effect<unknown, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(path, "utf8")
      .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
    if (text === undefined) return undefined;
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    const parsed = Either.try(() => JSON.parse(stripped) as unknown);
    return Either.isRight(parsed) ? parsed.right : undefined;
  });

/** A failed `fs.exists` is treated as "absent" (legacy `existsSync` returns `false`). */
const safeExists = (
  fs: FileSystem.FileSystem,
  p: string,
): Effect.Effect<boolean> => fs.exists(p).pipe(Effect.orElseSucceed(() => false));

/**
 * Resolve a tsconfig `extends` target to a path (legacy `resolveExtends`,
 * `discover-ts-project.ts:99-108`). Relative / absolute → resolve against `fromDir`,
 * appending `.json` when absent. Bare-package (e.g. `@tsconfig/strictest/tsconfig.json`)
 * → resolve under `node_modules`, again `.json`-suffixed; NEVER fails discovery on a
 * miss. Pure string math over the `Path` service.
 */
const resolveExtends = (path: Path.Path, fromDir: string, ext: string): string => {
  if (ext.startsWith(".") || path.isAbsolute(ext)) {
    const p = path.isAbsolute(ext) ? ext : path.resolve(fromDir, ext);
    return p.endsWith(".json") ? p : `${p}.json`;
  }
  const candidate = path.resolve(fromDir, "node_modules", ext);
  return candidate.endsWith(".json") ? candidate : `${candidate}.json`;
};

/**
 * Read a tsconfig and SHALLOWLY merge its `extends` parent (legacy `readTsconfig`,
 * `discover-ts-project.ts:67-96`). ONE level of `extends` is resolved (full deep/array
 * resolution is the compiler's job). A non-object / unreadable / unparseable file →
 * `{}`. A broken PARENT must NOT crash discovery — on a parent read/parse failure the
 * child's own options are used (legacy's try/catch "fall back to self").
 * Child `compilerOptions` win over parent (spread order). Error channel `never`.
 */
const readTsconfig = (
  path: Path.Path,
  tsconfigPath: string,
): Effect.Effect<RawTsconfig, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* readJsonFile(tsconfigPath);
    if (!isObject(raw)) return {};
    const self: RawTsconfig = {
      ...(typeof raw["extends"] === "string" ? { extends: raw["extends"] } : {}),
      ...(isObject(raw["compilerOptions"])
        ? { compilerOptions: raw["compilerOptions"] }
        : {}),
    };

    if (typeof self.extends === "string") {
      const parentPath = resolveExtends(path, path.dirname(tsconfigPath), self.extends);
      if (yield* safeExists(fs, parentPath)) {
        // A broken parent must not crash discovery. `readTsconfig` itself never fails
        // (readJsonFile → undefined → {}), so a missing/unparseable parent yields {}
        // compilerOptions and the merge below falls back to `self` — matching legacy's
        // try/catch fall-back-to-self.
        const parent = yield* readTsconfig(path, parentPath);
        return {
          compilerOptions: {
            ...(parent.compilerOptions ?? {}),
            ...(self.compilerOptions ?? {}),
          },
        };
      }
    }
    return self;
  });

/**
 * Resolve the installed `typescript` version, or null (legacy `resolveTsVersion`,
 * `discover-ts-project.ts:210-234`). 1) the actual installed `node_modules/typescript/
 * package.json#version` (authoritative); else 2) a declared dep range
 * (`dependencies`/`devDependencies`), stripped of range operators to `M.m.p` (a
 * two-part range becomes `M.m.0`). Error channel `never`.
 */
const resolveTsVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  pkg: Record<string, unknown>,
): Effect.Effect<string | null, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const tsPkgPath = path.join(root, "node_modules", "typescript", "package.json");
    if (yield* safeExists(fs, tsPkgPath)) {
      const tsPkg = yield* readJsonFile(tsPkgPath);
      if (isObject(tsPkg) && typeof tsPkg["version"] === "string") {
        return tsPkg["version"];
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
  });

/**
 * True iff `typescript` is declared or installed (legacy `hasTypeScript`,
 * `discover-ts-project.ts:237-246`). Installed `node_modules/typescript/package.json`
 * OR a declared `typescript` dep/devDep. Error channel `never`.
 */
const hasTypeScript = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  pkg: Record<string, unknown>,
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (yield* safeExists(fs, path.join(root, "node_modules", "typescript", "package.json"))) {
      return true;
    }
    const deps = {
      ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
      ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
    } as Record<string, unknown>;
    return typeof deps["typescript"] === "string";
  });

/**
 * Module system from `package.json#type` then tsconfig `module` (legacy
 * `detectModuleSystem`, `discover-ts-project.ts:248-265`). PURE. `type: "module"` →
 * esm; `type: "commonjs"` → cjs; else the tsconfig `module` string: an explicit
 * `commonjs` → cjs, every other string (incl. node16/nodenext) → esm; absent → esm.
 */
const detectModuleSystem = (
  pkg: Record<string, unknown>,
  compilerOptions: Record<string, unknown>,
): ModuleSystem => {
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

/**
 * Build tool from deps / scripts / config files (legacy `detectBuildTool`,
 * `discover-ts-project.ts:267-295`). Precedence: tsup > vite > esbuild > swc > bun >
 * babel > tsc (script `\btsc\b`) > unknown. A tool "has" if it is a dep, appears in any
 * script text, or has a `<name>.config.{ts,js,mjs}` file at root. Error channel `never`.
 */
const detectBuildTool = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  pkg: Record<string, unknown>,
): Effect.Effect<BuildTool, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const scripts = isObject(pkg["scripts"]) ? pkg["scripts"] : {};
    const scriptText = Object.values(scripts)
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    const allDeps = {
      ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
      ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
    } as Record<string, unknown>;

    const has = (name: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        if (name in allDeps || scriptText.includes(name)) return true;
        return (
          (yield* safeExists(fs, path.join(root, `${name}.config.ts`))) ||
          (yield* safeExists(fs, path.join(root, `${name}.config.js`))) ||
          (yield* safeExists(fs, path.join(root, `${name}.config.mjs`)))
        );
      });

    if (yield* has("tsup")) return "tsup";
    if (yield* has("vite")) return "vite";
    if (yield* has("esbuild")) return "esbuild";
    if ((yield* has("@swc/core")) || (yield* has("swc"))) return "swc";
    if (yield* has("bun")) return "bun";
    if ((yield* has("babel")) || (yield* has("@babel/core"))) return "babel";
    if (/\btsc\b/.test(scriptText)) return "tsc";
    return "unknown";
  });

/**
 * Project kind heuristics (legacy `detectProjectKind`, `discover-ts-project.ts:297-320`).
 * monorepo = `workspaces` array / `{ packages: [...] }` OR `pnpm-workspace.yaml`; lib =
 * an `exports` map (object or string) OR (`types`/`typings` AND `files[]`); app = `bin`
 * present OR a `start` script; else unknown. Order is load-bearing (monorepo > lib >
 * app). Error channel `never`.
 */
const detectProjectKind = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  pkg: Record<string, unknown>,
): Effect.Effect<ProjectKind, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const workspaces = pkg["workspaces"];
    const hasWorkspaces =
      Array.isArray(workspaces) ||
      (isObject(workspaces) && Array.isArray(workspaces["packages"]));
    if (hasWorkspaces || (yield* safeExists(fs, path.join(root, "pnpm-workspace.yaml")))) {
      return "monorepo";
    }
    const hasExports = isObject(pkg["exports"]) || typeof pkg["exports"] === "string";
    const hasTypes =
      typeof pkg["types"] === "string" || typeof pkg["typings"] === "string";
    const hasFiles = Array.isArray(pkg["files"]);
    if (hasExports || (hasTypes && hasFiles)) return "lib";
    const scripts = isObject(pkg["scripts"]) ? pkg["scripts"] : {};
    if (pkg["bin"] !== undefined || typeof scripts["start"] === "string") {
      return "app";
    }
    return "unknown";
  });

/**
 * Discover a TypeScript project rooted at `dir` (C1, RULE-022). Port of legacy
 * `discoverTsProject` (`discover-ts-project.ts:329-388`).
 *
 * Returns an `Effect<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError,
 * FileSystem | Path>`:
 *   - FAILS with {@link TsconfigNotFoundError} when no `tsconfig.json` at `dir` (the
 *     legacy `throw` → Effect error channel).
 *   - FAILS with {@link NoTypeScriptProjectError} when `typescript` is NOT resolvable
 *     AND there are ZERO `.ts`/`.tsx` sources.
 *   - SUCCEEDS otherwise — including when `package.json` is missing/broken/unreadable
 *     (NON-fatal: discovery continues with `pkg = {}` defaults; legacy `try/catch`).
 *
 * The error messages are reproduced VERBATIM (they reach the CLI / `serializeError`,
 * RULE-037). `typecheckOk` is HARDCODED `false` (PENDING — engine reconciles, RULE-021).
 */
export const discoverTsProject: (
  dir: string,
) => Effect.Effect<
  ProjectInfo,
  TsconfigNotFoundError | NoTypeScriptProjectError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("Discovery.discover")(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(dir);

  const tsconfigPath = path.join(root, "tsconfig.json");
  if (!(yield* safeExists(fs, tsconfigPath))) {
    return yield* Effect.fail(
      new TsconfigNotFoundError(
        `No tsconfig.json found in ${root}. ts-fix analyzes TypeScript projects only.`,
      ),
    );
  }

  const tsconfig = yield* readTsconfig(path, tsconfigPath);
  const compilerOptions = tsconfig.compilerOptions ?? {};

  // A broken/unreadable/non-object package.json is NON-fatal — defaults to {}.
  const pkgPath = path.join(root, "package.json");
  const rawPkg = (yield* safeExists(fs, pkgPath))
    ? yield* readJsonFile(pkgPath)
    : undefined;
  const pkg: Record<string, unknown> = isObject(rawPkg) ? rawPkg : {};

  const sourceFileCount = yield* countSourceFiles(root);
  const tsResolvable = yield* hasTypeScript(fs, path, root, pkg);
  if (!tsResolvable && sourceFileCount === 0) {
    return yield* Effect.fail(
      new NoTypeScriptProjectError(
        `No resolvable 'typescript' dependency and no .ts/.tsx sources found in ${root}.`,
      ),
    );
  }

  const tsVersion = yield* resolveTsVersion(fs, path, root, pkg);
  const tsMajorParsed = tsVersion !== null ? Number.parseInt(tsVersion, 10) : null;

  const strictFlags: Record<string, boolean> = Object.fromEntries(
    STRICT_FLAGS.filter((f) => compilerOptions[f] === true).map((f) => [f, true]),
  );

  const pkgName = pkg["name"];
  const projectName =
    typeof pkgName === "string" && pkgName.length > 0 ? pkgName : path.basename(root);

  const projectKind = yield* detectProjectKind(fs, path, root, pkg);
  const buildTool = yield* detectBuildTool(fs, path, root, pkg);

  return {
    rootDirectory: root,
    projectName,
    tsVersion,
    tsMajor:
      tsMajorParsed !== null && Number.isFinite(tsMajorParsed) ? tsMajorParsed : null,
    projectKind,
    moduleSystem: detectModuleSystem(pkg, compilerOptions),
    buildTool,
    strictFlags,
    // PENDING (RULE-021): discovery does NOT type-check. The engine reconciles the
    // real `typecheckOk` from a `ts.Program` later. Default false so the partial-
    // honesty path (BC-03) is the safe default until proven clean.
    typecheckOk: false,
    sourceFileCount,
  } satisfies ProjectInfo;
});
