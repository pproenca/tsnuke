/**
 * Project discovery (C1, BC-06) + capability computation (C2, BC-07).
 *
 * `discoverTsProject` reads `tsconfig.json` (resolving `extends` shallowly) and
 * `package.json` to produce a {@link ProjectInfo}; it refuses non-TS projects.
 * `computeCapabilities` turns those facts into the token `Set<string>` that
 * drives capability-gated rule activation.
 *
 * Uses Node `fs` only — no network, no clock (determinism, §1.2).
 *
 * See REIMAGINED_ARCHITECTURE.md §4.1 / AI_NATIVE_SPEC.md §1 (C1/C2).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Capability } from "@ts-doctor/rules";
import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "./errors.js";
import type { ProjectInfo } from "./types.js";

/** Strict-family tsconfig flags we surface as capability tokens (BC-07). */
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

function readJsonFile(path: string): unknown {
  const text = readFileSync(path, "utf8");
  // Tolerate trailing commas / // comments commonly found in tsconfig.json by
  // stripping them with a conservative pass before JSON.parse.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read a tsconfig and shallowly merge its `extends` parent (scaffold-level —
 * a single level of `extends` is resolved; full deep/array resolution is the
 * compiler's `ts.readConfigFile` job for the real Tier-2 build).
 */
function readTsconfig(path: string): RawTsconfig {
  const raw = readJsonFile(path);
  if (!isObject(raw)) return {};
  const self: RawTsconfig = {
    ...(typeof raw["extends"] === "string"
      ? { extends: raw["extends"] }
      : {}),
    ...(isObject(raw["compilerOptions"])
      ? { compilerOptions: raw["compilerOptions"] }
      : {}),
  };

  if (typeof self.extends === "string") {
    const parentPath = resolveExtends(dirname(path), self.extends);
    if (parentPath !== null && existsSync(parentPath)) {
      try {
        const parent = readTsconfig(parentPath);
        return {
          compilerOptions: {
            ...(parent.compilerOptions ?? {}),
            ...(self.compilerOptions ?? {}),
          },
        };
      } catch {
        // A broken parent must not crash discovery — fall back to self.
      }
    }
  }
  return self;
}

/** Resolve a tsconfig `extends` target to a path (relative or bare-ish). */
function resolveExtends(fromDir: string, ext: string): string | null {
  if (ext.startsWith(".") || isAbsolute(ext)) {
    const p = isAbsolute(ext) ? ext : resolve(fromDir, ext);
    return p.endsWith(".json") ? p : `${p}.json`;
  }
  // Bare package extends (e.g. "@tsconfig/strictest/tsconfig.json"): try
  // node_modules, but never fail discovery on miss.
  const candidate = resolve(fromDir, "node_modules", ext);
  return candidate.endsWith(".json") ? candidate : `${candidate}.json`;
}

/** Recursively count `.ts`/`.tsx` files, skipping noise dirs; capped for speed. */
function countSourceFiles(root: string, cap = 5000): number {
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
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
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
}

/** Directories never worth walking for source files. */
const SOURCE_SCAN_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  "storybook-static",
]);

/**
 * Collect a project's source files for a full-tree scan: all `.ts`/`.tsx` under
 * `root` (excluding `.d.ts`, dot-dirs, and noise dirs), as absolute paths. Used
 * by `diagnose()` when no explicit include set (diff/staged) is given. Capped for
 * safety on very large trees.
 */
export function collectSourceFiles(root: string, cap = 10000): string[] {
  const out: string[] = [];
  const stack: string[] = [resolve(root)];
  while (stack.length > 0 && out.length < cap) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SOURCE_SCAN_IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.endsWith(".d.ts")
      ) {
        out.push(full);
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}

/** Resolve the installed `typescript` version, or null if unresolvable. */
function resolveTsVersion(root: string, pkg: Record<string, unknown>): string | null {
  // 1. Try the actual installed package's version (authoritative).
  const tsPkgPath = join(root, "node_modules", "typescript", "package.json");
  if (existsSync(tsPkgPath)) {
    try {
      const tsPkg = readJsonFile(tsPkgPath);
      if (isObject(tsPkg) && typeof tsPkg["version"] === "string") {
        return tsPkg["version"];
      }
    } catch {
      /* fall through */
    }
  }
  // 2. Fall back to a declared dependency range, stripped of range operators.
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
}

/** True iff `typescript` is declared or installed for this project. */
function hasTypeScript(root: string, pkg: Record<string, unknown>): boolean {
  if (existsSync(join(root, "node_modules", "typescript", "package.json"))) {
    return true;
  }
  const deps = {
    ...(isObject(pkg["dependencies"]) ? pkg["dependencies"] : {}),
    ...(isObject(pkg["devDependencies"]) ? pkg["devDependencies"] : {}),
  } as Record<string, unknown>;
  return typeof deps["typescript"] === "string";
}

function detectModuleSystem(
  pkg: Record<string, unknown>,
  compilerOptions: Record<string, unknown>,
): "esm" | "cjs" {
  if (pkg["type"] === "module") return "esm";
  if (pkg["type"] === "commonjs") return "cjs";
  const mod = compilerOptions["module"];
  if (typeof mod === "string") {
    const m = mod.toLowerCase();
    if (m.includes("commonjs") || m.includes("node16") || m.includes("nodenext")) {
      // node16/nodenext are dual; lean on package.json#type which we already
      // checked, so treat the explicit commonjs as cjs and the rest as esm.
      if (m.includes("commonjs")) return "cjs";
    }
    return "esm";
  }
  return "esm";
}

function detectBuildTool(
  root: string,
  pkg: Record<string, unknown>,
): ProjectInfo["buildTool"] {
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
    existsSync(join(root, `${name}.config.ts`)) ||
    existsSync(join(root, `${name}.config.js`)) ||
    existsSync(join(root, `${name}.config.mjs`));

  if (has("tsup")) return "tsup";
  if (has("vite")) return "vite";
  if (has("esbuild")) return "esbuild";
  if (has("@swc/core") || has("swc")) return "swc";
  if (has("bun")) return "bun";
  if (has("babel") || has("@babel/core")) return "babel";
  if (/\btsc\b/.test(scriptText)) return "tsc";
  return "unknown";
}

function detectProjectKind(
  root: string,
  pkg: Record<string, unknown>,
): ProjectInfo["projectKind"] {
  // monorepo: workspaces field or pnpm-workspace.yaml.
  const hasWorkspaces =
    Array.isArray(pkg["workspaces"]) ||
    (isObject(pkg["workspaces"]) && Array.isArray(pkg["workspaces"]["packages"]));
  if (hasWorkspaces || existsSync(join(root, "pnpm-workspace.yaml"))) {
    return "monorepo";
  }
  // lib: has an `exports` map, or `types`/`typings` together with `files`.
  const hasExports = isObject(pkg["exports"]) || typeof pkg["exports"] === "string";
  const hasTypes =
    typeof pkg["types"] === "string" || typeof pkg["typings"] === "string";
  const hasFiles = Array.isArray(pkg["files"]);
  if (hasExports || (hasTypes && hasFiles)) return "lib";
  // app: has a bin, or a start script.
  const scripts = isObject(pkg["scripts"]) ? pkg["scripts"] : {};
  if (pkg["bin"] !== undefined || typeof scripts["start"] === "string") {
    return "app";
  }
  return "unknown";
}

/**
 * Discover a TypeScript project rooted at `dir` (C1, BC-06).
 *
 * @throws {TsconfigNotFoundError} when no `tsconfig.json` exists at `dir`.
 * @throws {NoTypeScriptProjectError} when `typescript` is not resolvable AND no
 *         `.ts`/`.tsx` sources exist.
 */
export function discoverTsProject(dir: string): ProjectInfo {
  const root = resolve(dir);
  const tsconfigPath = join(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    throw new TsconfigNotFoundError(
      `No tsconfig.json found in ${root}. ts-doctor analyzes TypeScript projects only.`,
    );
  }

  const tsconfig = readTsconfig(tsconfigPath);
  const compilerOptions = tsconfig.compilerOptions ?? {};

  const pkgPath = join(root, "package.json");
  let pkg: Record<string, unknown> = {};
  if (existsSync(pkgPath)) {
    try {
      const raw = readJsonFile(pkgPath);
      if (isObject(raw)) pkg = raw;
    } catch {
      // A broken package.json is not fatal — discovery continues with defaults.
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
    typeof pkg["name"] === "string" && pkg["name"].length > 0
      ? pkg["name"]
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
    // PENDING: real ts.Program build (BC-07/§4.1). Discovery does not type-check;
    // the orchestrator derives `typecheckOk` from the Program. Default false so
    // the partial-honesty path (BC-03) is the safe default until proven clean.
    typecheckOk: false,
    sourceFileCount,
  };
}

/** moduleResolution token derived from compiler options, if known. */
function moduleResolutionToken(info: ProjectInfo): Capability | null {
  // The scaffold ProjectInfo doesn't carry moduleResolution explicitly; derive a
  // sensible token from the module system so the vocabulary is present and
  // testable. Real value comes from parsed CompilerOptions in the Tier-2 build.
  return info.moduleSystem === "esm"
    ? "moduleResolution:bundler"
    : "moduleResolution:node";
}

/**
 * Compute the capability token `Set<string>` from {@link ProjectInfo} (C2, BC-07).
 *
 * Emits, in this vocabulary:
 *  - `ts:<major.minor>`         (when a version is known)
 *  - one token per ON strict flag (e.g. `strict`, `noUncheckedIndexedAccess`)
 *  - `esm` | `cjs`
 *  - `moduleResolution:*`
 *  - `app` | `lib` | `monorepo` (omitted when `unknown`)
 *  - `build:<tool>`             (omitted when `unknown`)
 *  - `tsconfig`                 (always — a tsconfig was found by discovery)
 *  - `typecheck:ok`             ONLY when `info.typecheckOk` is true
 *
 * INVERSION (BC-07/BC-09): a strict flag that is OFF emits no token, so an
 * "enable-X" CFG rule (`disabledBy:[X]`) fires precisely when the flag is absent.
 */
export function computeCapabilities(info: ProjectInfo): Set<Capability> {
  const caps = new Set<Capability>();

  // tsconfig is always present (discovery threw otherwise).
  caps.add("tsconfig");

  if (info.tsVersion !== null) {
    const m = info.tsVersion.match(/^(\d+)\.(\d+)/);
    if (m) caps.add(`ts:${m[1]}.${m[2]}`);
  }

  for (const [flag, on] of Object.entries(info.strictFlags)) {
    if (on) caps.add(flag);
  }

  caps.add(info.moduleSystem); // "esm" | "cjs"
  const modRes = moduleResolutionToken(info);
  if (modRes !== null) caps.add(modRes);

  if (info.projectKind !== "unknown") caps.add(info.projectKind);
  if (info.buildTool !== "unknown") caps.add(`build:${info.buildTool}`);

  // typecheck:ok is the gated Tier-2 signal — present ONLY when proven (§4.1).
  if (info.typecheckOk) caps.add("typecheck:ok");

  return caps;
}
