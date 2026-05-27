/**
 * `diagnoseWorkspace()` — the MONOREPO boundary (BC-05). Wires the previously-dormant
 * multi-project path: pointing tsnuke at a workspace ROOT (which has no `tsconfig.json`
 * of its own, only per-package ones) discovers each member project and analyzes them all,
 * so the caller can roll their scores up to a min-score summary (the `build-report` slice
 * already does the rollup over an array of projects).
 *
 * Behaviour:
 *   - `rootDirectory` HAS a `tsconfig.json`  → it's a single project; analyze just it
 *     (`isWorkspace: false`, one result) — identical to `diagnose()`.
 *   - `rootDirectory` is a WORKSPACE with ≥1 member carrying a `tsconfig.json` → analyze
 *     each member (`isWorkspace: true`, one result per member, sorted by directory).
 *   - otherwise (no root tsconfig AND not an analyzable workspace) → delegate to
 *     `diagnose(rootDirectory)`, which FAILS with the usual `TsconfigNotFoundError` /
 *     `NoTypeScriptProjectError` — the error message a non-workspace, non-project dir
 *     already produced. No behaviour change for that case.
 *
 * RESOURCE LIFETIME (RULE-036 / BC-24). Each per-project `diagnose` runs under its OWN
 * `Effect.scoped`, so the engine's `ts.Program` for project N is built, used, and RELEASED
 * before project N+1 begins (the exact "scopedProgram loop, no Program from project N
 * survives into N+1" the engine's `node.ts` anticipated). Projects are analyzed
 * SEQUENTIALLY — one Program alive at a time keeps the RULE-013 memory ceiling per-project,
 * not multiplied across the workspace. `diagnoseWorkspace` therefore does NOT require
 * `Scope` on its context (each scope is discharged internally); only `FileSystem | Path`.
 */

import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { enumerateWorkspaceProjects } from "@tsnuke/discovery-effect";
import { loadConfig } from "@tsnuke/config-effect";
import type {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@tsnuke/errors-effect";
import { diagnose } from "./diagnose.js";
import { safeEmit } from "./progress.js";
import type { RunEngineOptions } from "./runEngine.js";
import type { DiagnoseOptions, DiagnoseResult, WorkspaceResult } from "./types.js";

/** A failed `fs.exists` is treated as "absent" (mirrors discovery's `safeExists`). */
const safeExists = (
  fs: FileSystem.FileSystem,
  p: string,
): Effect.Effect<boolean> => fs.exists(p).pipe(Effect.orElseSucceed(() => false));

/**
 * Diagnose a directory that MAY be a multi-package workspace (the monorepo boundary).
 *
 * Returns a {@link WorkspaceResult} (always ≥1 project). Error channel: discovery's typed
 * `TsconfigNotFoundError`/`NoTypeScriptProjectError` (only on the non-workspace fallback).
 * Requirements: `FileSystem` + `Path` — the per-project `Scope` is discharged internally
 * via `Effect.scoped`, so (unlike `diagnose`) callers need NOT provide `Scope`.
 */
export const diagnoseWorkspace: (
  directory: string,
  options?: DiagnoseOptions & { readonly memory?: RunEngineOptions["memory"] },
) => Effect.Effect<
  WorkspaceResult,
  TsconfigNotFoundError | NoTypeScriptProjectError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("Engine.diagnoseWorkspace")(function* (
  directory: string,
  options: DiagnoseOptions & { readonly memory?: RunEngineOptions["memory"] } = {},
) {
  const startedAt = yield* Effect.sync(() => Date.now());
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(directory);

  const rootHasTsconfig = yield* safeExists(fs, path.join(root, "tsconfig.json"));
  const memberDirs = rootHasTsconfig
    ? []
    : yield* enumerateWorkspaceProjects(root);

  // Single project (root is itself a TS project) OR not an analyzable workspace: delegate
  // to single-project `diagnose`. The latter FAILS with the usual discovery error — the
  // exact message a bare directory already produced. Each call is scoped (Program released).
  if (rootHasTsconfig || memberDirs.length === 0) {
    const single = yield* Effect.scoped(diagnose(directory, options));
    const elapsedMilliseconds = (yield* Effect.sync(() => Date.now())) - startedAt;
    return {
      rootDirectory: root,
      isWorkspace: false,
      projects: [single],
      elapsedMilliseconds,
    } satisfies WorkspaceResult;
  }

  // Load the workspace-root `tsnuke.config.json` ONCE and apply it to every member —
  // a workspace-wide policy (ignore globs, rule overrides) lives at the workspace root,
  // not 32× in each package. Per-package configs are reachable by callers passing
  // `options.config` explicitly, in which case THAT wins.
  const rootConfig = options.config ?? (yield* loadConfig(root));
  const memberOptions: typeof options = { ...options, config: rootConfig };

  // Workspace: analyze each member SEQUENTIALLY, each under its own Scope so project N's
  // Program is released before N+1 (RULE-036 / BC-24 — bounded memory across the run).
  // Per-project `project-start` events let the renderer show "3/12 packages/foo" headers.
  const total = memberDirs.length;
  const onProgress = options.onProgress;
  const projects: DiagnoseResult[] = [];
  for (const [i, memberDir] of memberDirs.entries()) {
    safeEmit(onProgress, { kind: "project-start", index: i + 1, total, directory: memberDir });
    const r = yield* Effect.scoped(diagnose(memberDir, memberOptions));
    projects.push(r);
  }

  const elapsedMilliseconds = (yield* Effect.sync(() => Date.now())) - startedAt;
  return {
    rootDirectory: root,
    isWorkspace: true,
    projects,
    elapsedMilliseconds,
  } satisfies WorkspaceResult;
});
