/**
 * Workspace enumeration (monorepo discovery) over the `@effect/platform` `FileSystem` +
 * `Path` services. This is the piece that wires the dormant monorepo path: pointing
 * `tsnuke` at a workspace ROOT (which has no `tsconfig.json` of its own, only per-package
 * ones) should discover each member project and let the engine roll their scores up to a
 * BC-05 min-score summary.
 *
 * `enumerateWorkspaceProjects(dir)` reads the workspace's member globs from
 * `pnpm-workspace.yaml` (`packages:`) and/or `package.json#workspaces`, expands them
 * against the filesystem, and returns the ABSOLUTE directories that actually contain a
 * `tsconfig.json` (i.e. the analyzable TS projects), sorted for deterministic output.
 * A directory that is not a workspace — or whose members carry no `tsconfig.json` —
 * yields `[]`, and the caller falls back to single-project discovery (which then fails
 * with the usual `TsconfigNotFoundError`).
 *
 * Glob support is the pragmatic subset real workspace configs use: an exact path,
 * `prefix/*` (immediate child dirs), `prefix/**` (all descendant dirs), and a
 * partial-wildcard segment like `pkg-*`. Optional trailing segments after a `*` are
 * honored (e.g. a "packages, then star, then sub" pattern). Negations (`!pattern`) are
 * treated as excludes. Error
 * channel `never` — like the rest of discovery's fs walks, an unreadable dir / failed
 * stat is silently skipped (legacy `try { … } catch { continue }`).
 */

import { FileSystem, Path } from "@effect/platform";
import { Effect, Either } from "effect";

/** A failed `fs.exists` is treated as "absent" (mirrors discover.ts `safeExists`). */
const safeExists = (
  fs: FileSystem.FileSystem,
  p: string,
): Effect.Effect<boolean> => fs.exists(p).pipe(Effect.orElseSucceed(() => false));

/** Read a directory's entry names; an unreadable dir → `[]` (skip + keep walking). */
const safeReadDirectory = (
  fs: FileSystem.FileSystem,
  dir: string,
): Effect.Effect<ReadonlyArray<string>> =>
  fs.readDirectory(dir).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

/** `stat` → is-directory, with a failed stat collapsing to `false` (skip the entry). */
const safeIsDirectory = (
  fs: FileSystem.FileSystem,
  full: string,
): Effect.Effect<boolean> =>
  fs.stat(full).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => false),
  );

/** Read + JSON.parse a file, or `undefined` on any read/parse failure (never throws). */
const readJson = (
  fs: FileSystem.FileSystem,
  p: string,
): Effect.Effect<unknown> =>
  Effect.gen(function* () {
    const text = yield* fs
      .readFileString(p, "utf8")
      .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
    if (text === undefined) return undefined;
    // tsnuke-disable-next-line no-unknown-return
    const parsed = Either.try((): unknown => JSON.parse(text));
    return Either.isRight(parsed) ? parsed.right : undefined;
  });

/** Strip one layer of matching quotes from a YAML/JSON-ish scalar. */
const unquote = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
};

/**
 * Extract the `packages:` list from a `pnpm-workspace.yaml`. Handles the common block
 * form (`packages:\n  - "packages/*"`) and the inline-array form
 * (`packages: ["packages/*"]`). Stops the block scan at the next top-level key. Comments
 * and blank lines are skipped. Deliberately minimal — no YAML dependency for one field.
 */
export const parsePnpmWorkspacePackages = (yaml: string): string[] => {
  const lines = yaml.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => /^packages:/.test(l));
  if (headerIndex === -1) return [];

  const header = lines[headerIndex] ?? "";
  const inline = header.slice(header.indexOf(":") + 1).trim();
  if (inline.startsWith("[")) {
    const body = inline.replace(/^\[/, "").replace(/\].*$/, "");
    return body
      .split(",")
      .map((s) => unquote(s))
      .filter((s) => s.length > 0);
  }

  const out: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item?.[1] !== undefined) {
      const value = unquote(item[1].replace(/\s+#.*$/, ""));
      if (value.length > 0) out.push(value);
      continue;
    }
    break; // a non-indented / non-list line → the next top-level key
  }
  return out;
};

/** Extract member globs from `package.json#workspaces` (array OR `{ packages: [...] }`). */
const parsePackageJsonWorkspaces = (pkg: unknown): string[] => {
  if (typeof pkg !== "object" || pkg === null || !("workspaces" in pkg)) return [];
  const ws: unknown = pkg.workspaces;
  if (Array.isArray(ws)) return ws.filter((v): v is string => typeof v === "string");
  if (typeof ws === "object" && ws !== null && "packages" in ws) {
    const inner: unknown = ws.packages;
    if (Array.isArray(inner)) return inner.filter((v): v is string => typeof v === "string");
  }
  return [];
};

/** A single glob segment → a `RegExp` (only `*` is special; anchored full-match). */
const segmentToRegExp = (segment: string): RegExp =>
  new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

/** Every descendant directory of `base` (inclusive), skipping `node_modules`/dot-dirs. */
const descendantDirs = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  base: string,
): Effect.Effect<string[]> =>
  Effect.gen(function* () {
    const out: string[] = [];
    const stack: string[] = [base];
    while (stack.length > 0) {
      const dir = stack.pop();
      if (dir === undefined) break;
      out.push(dir);
      for (const entry of yield* safeReadDirectory(fs, dir)) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const full = path.join(dir, entry);
        if (yield* safeIsDirectory(fs, full)) stack.push(full);
      }
    }
    return out;
  });

/**
 * Expand one workspace glob (relative to `root`) into candidate directories. Supports an
 * exact path, a `*` segment (immediate children, with optional trailing segments), a `**`
 * segment (all descendants), and a partial-wildcard segment (`pkg-*`).
 */
const expandPattern = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  pattern: string,
): Effect.Effect<string[]> =>
  Effect.gen(function* () {
    const segments = pattern.split("/").filter((s) => s.length > 0);
    const starIndex = segments.findIndex((s) => s.includes("*"));

    if (starIndex === -1) {
      const full = path.resolve(root, pattern);
      return (yield* safeIsDirectory(fs, full)) ? [full] : [];
    }

    const base = path.resolve(root, ...segments.slice(0, starIndex));
    const star = segments[starIndex] ?? "*";
    const rest = segments.slice(starIndex + 1);

    if (star === "**") {
      const dirs = yield* descendantDirs(fs, path, base);
      if (rest.length === 0) return dirs;
      const joined = dirs.map((d) => path.join(d, ...rest));
      return yield* Effect.filter(joined, (d) => safeIsDirectory(fs, d));
    }

    const matcher = segmentToRegExp(star);
    const children: string[] = [];
    for (const entry of yield* safeReadDirectory(fs, base)) {
      if (!matcher.test(entry)) continue;
      const full = path.join(base, entry);
      if (yield* safeIsDirectory(fs, full)) children.push(full);
    }
    if (rest.length === 0) return children;
    const joined = children.map((d) => path.join(d, ...rest));
    return yield* Effect.filter(joined, (d) => safeIsDirectory(fs, d));
  });

/**
 * Discover the analyzable member projects of the workspace rooted at `dir` (RULE-022,
 * BC-06/07 extended to monorepos). Returns the ABSOLUTE directories that contain a
 * `tsconfig.json`, sorted; `[]` when `dir` is not a workspace or no member is a TS
 * project. The single source of "what counts as a project" stays `tsconfig.json`
 * presence — identical to single-project `discoverTsProject`.
 */
export const enumerateWorkspaceProjects: (
  dir: string,
) => Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =
  Effect.fn("Discovery.enumerateWorkspace")(function* (dir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(dir);

    const patterns: string[] = [];
    const pnpmPath = path.join(root, "pnpm-workspace.yaml");
    if (yield* safeExists(fs, pnpmPath)) {
      const text = yield* fs
        .readFileString(pnpmPath, "utf8")
        .pipe(Effect.orElseSucceed(() => "" as string));
      patterns.push(...parsePnpmWorkspacePackages(text));
    }
    const pkgPath = path.join(root, "package.json");
    if (yield* safeExists(fs, pkgPath)) {
      patterns.push(...parsePackageJsonWorkspaces(yield* readJson(fs, pkgPath)));
    }
    if (patterns.length === 0) return [];

    const includes = patterns.filter((p) => !p.startsWith("!"));
    const excludePatterns = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));

    const candidates = new Set<string>();
    for (const pattern of includes) {
      for (const d of yield* expandPattern(fs, path, root, pattern)) candidates.add(d);
    }
    const excluded = new Set<string>();
    for (const pattern of excludePatterns) {
      for (const d of yield* expandPattern(fs, path, root, pattern)) excluded.add(d);
    }

    const projects: string[] = [];
    for (const d of candidates) {
      if (excluded.has(d)) continue;
      if (yield* safeExists(fs, path.join(d, "tsconfig.json"))) projects.push(d);
    }
    return projects.sort();
  });
