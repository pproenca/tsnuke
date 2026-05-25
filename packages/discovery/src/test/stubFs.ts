/**
 * STUB FILESYSTEM LAYER — backed by an in-memory tree (NO real disk). The discovery
 * test pattern, mirroring the config slice's `stubFsLayer` (`modernized/config/effect/
 * src/test/loadConfig.test.ts`) but extended for the THREE operations the discovery
 * walkers + reader need: `exists`, `readFileString`, `readDirectory`, `stat`.
 *
 * The tree is a flat `Map<absolutePath, FileNode>` where every entry is EITHER a file
 * (`{ kind: "file", contents }`) or a directory (`{ kind: "dir" }`). Directory children
 * are derived from path prefixes (an entry `/a/b/c.ts` implies `/a`, `/a/b` are dirs).
 * `FileSystem.layerNoop(partial)` builds a Layer providing a FileSystem whose methods
 * are no-ops EXCEPT the four we override.
 *
 * Error injection: a missing path in `readDirectory`/`stat`/`readFileString` FAILS with
 * a real `SystemError` (`@effect/platform/Error`), exercising the walkers' `PlatformError
 * → skip` mapping (RULE-012) and the reader's `PlatformError → undefined` mapping
 * (RULE-022). A path explicitly marked `{ kind: "unreadable" }` ALSO fails — used to
 * test the "unreadable directory skipped" edge case without removing it from the tree.
 *
 * `Path` is the REAL platform-agnostic `Path.layer` — `join`/`resolve`/`dirname`/
 * `basename`/`isAbsolute` are pure string ops (no I/O); using the real service (not a
 * stub) proves the discovery path-joining matches `node:path` semantics, the legacy
 * contract. On this POSIX test host the map keys are POSIX absolute paths.
 */

import { FileSystem, Path } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { Effect, Layer, Option } from "effect";

/** A node in the in-memory tree. `unreadable` simulates an EACCES dir/file. */
export type FileNode =
  | { readonly kind: "file"; readonly contents: string }
  | { readonly kind: "dir" }
  | { readonly kind: "unreadable" };

/** The in-memory tree: absolute path → node. */
export type Tree = ReadonlyMap<string, FileNode>;

const notFound = (method: string, path: string): SystemError =>
  new SystemError({
    reason: "NotFound",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
  });

const permissionDenied = (method: string, path: string): SystemError =>
  new SystemError({
    reason: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
  });

/** A minimal `File.Info` carrying only the `type` the walkers read; rest stubbed. */
const fileInfo = (type: FileSystem.File.Info["type"]): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(0),
  blksize: Option.none(),
  blocks: Option.none(),
});

/**
 * Build a `Layer<FileSystem>` over an in-memory `Tree`.
 *  - `exists(p)`        → the tree has `p` (any kind). An `unreadable` node still EXISTS
 *                          (legacy `existsSync` returns true for an EACCES path).
 *  - `readFileString(p)`→ a `file` node's contents; a `dir`/`unreadable`/missing → fail
 *                          (`SystemError`), which callers map to "undefined/skip".
 *  - `readDirectory(p)` → the immediate child BASE NAMES of a `dir` node; an
 *                          `unreadable` node fails (PermissionDenied); a `file`/missing
 *                          fails (NotFound).
 *  - `stat(p)`          → `{ type: "Directory" }` for a `dir`, `"File"` for a `file`; an
 *                          `unreadable` node fails (PermissionDenied); missing fails.
 */
export const stubFsLayer = (tree: Tree): Layer.Layer<FileSystem.FileSystem> => {
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

  return FileSystem.layerNoop({
    exists: (path: string) => Effect.succeed(tree.has(path)),
    readFileString: (path: string) => {
      const node = tree.get(path);
      if (node?.kind === "file") return Effect.succeed(node.contents);
      if (node?.kind === "unreadable")
        return Effect.fail(permissionDenied("readFileString", path));
      return Effect.fail(notFound("readFileString", path));
    },
    readDirectory: (path: string) => {
      const node = tree.get(path);
      if (node?.kind === "dir") return Effect.succeed(childrenOf(path));
      if (node?.kind === "unreadable")
        return Effect.fail(permissionDenied("readDirectory", path));
      return Effect.fail(notFound("readDirectory", path));
    },
    stat: (path: string) => {
      const node = tree.get(path);
      if (node?.kind === "dir") return Effect.succeed(fileInfo("Directory"));
      if (node?.kind === "file") return Effect.succeed(fileInfo("File"));
      if (node?.kind === "unreadable")
        return Effect.fail(permissionDenied("stat", path));
      return Effect.fail(notFound("stat", path));
    },
  });
};

/** Full requirements (`FileSystem` + real `Path`) for discovery, all in-memory. */
export const testLayer = (
  tree: Tree,
): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
  Layer.merge(stubFsLayer(tree), Path.layer);

/**
 * Build a {@link Tree} from a flat object of `{ absolutePath: contents | DIR }`,
 * auto-creating every ancestor directory. Pass {@link DIR} as a value to mark an entry
 * a directory; pass {@link UNREADABLE} to mark it unreadable; any other string is a file.
 */
export const DIR = Symbol("dir");
export const UNREADABLE = Symbol("unreadable");

export const makeTree = (
  entries: Record<string, string | typeof DIR | typeof UNREADABLE>,
): Tree => {
  const map = new Map<string, FileNode>();
  const ensureAncestors = (path: string): void => {
    const parts = path.split("/").filter((s) => s.length > 0);
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc += `/${parts[i]}`;
      if (!map.has(acc)) map.set(acc, { kind: "dir" });
    }
  };
  for (const [path, value] of Object.entries(entries)) {
    ensureAncestors(path);
    if (value === DIR) map.set(path, { kind: "dir" });
    else if (value === UNREADABLE) map.set(path, { kind: "unreadable" });
    else map.set(path, { kind: "file", contents: value });
  }
  return map;
};
