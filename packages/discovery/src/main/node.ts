/**
 * Production wiring — the real Node-backed `FileSystem` + `Path` Layers + runnable
 * convenience helpers (mirrors the config slice's `NodeContext`/`*Node` helpers).
 *
 * This is the ONLY module that references `@effect/platform-node`; the discovery logic
 * (`discover.ts`, `enumerate.ts`) stays platform-agnostic — it depends on the
 * `@effect/platform` SERVICE INTERFACES, not Node. Tests provide a different (in-memory)
 * Layer for the SAME two services, so swapping disk for an in-memory map is a one-line
 * Layer change with zero logic changes.
 *
 * The discovery helpers run as `Effect.runPromise` — `discoverTsProjectNode` may REJECT
 * (the discovery Effect can FAIL with `TsconfigNotFoundError`/`NoTypeScriptProjectError`
 * on its error channel; `runPromise` rejects with the failure), whereas the enumeration
 * helpers NEVER reject (error channel `never`).
 */

import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@tsnuke/errors-effect";
import { Effect, Layer } from "effect";
import { discoverTsProject } from "./discover.js";
import { collectSourceFiles, countSourceFiles } from "./enumerate.js";
import type { ProjectInfo } from "./ProjectInfo.js";

/**
 * The production Layer: the real Node-backed `FileSystem` + `Path` services. The single
 * place `@effect/platform-node` is referenced. Tests provide an in-memory Layer for the
 * same `FileSystem | Path` requirements.
 */
export const NodeContext: Layer.Layer<FileSystem.FileSystem | Path.Path> = Layer.merge(
  NodeFileSystem.layer,
  NodePath.layer,
);

/**
 * Runnable: discover a TypeScript project from a real directory on disk, resolving the
 * `FileSystem`/`Path` requirements with {@link NodeContext}. REJECTS with
 * {@link TsconfigNotFoundError} / {@link NoTypeScriptProjectError} (RULE-022) when the
 * directory is not a valid TS project; resolves with a {@link ProjectInfo} otherwise.
 */
export const discoverTsProjectNode = (dir: string): Promise<ProjectInfo> =>
  Effect.runPromise(discoverTsProject(dir).pipe(Effect.provide(NodeContext)));

/**
 * Runnable: count `.ts`/`.tsx` sources under a real directory (RULE-012, cap 5000).
 * NEVER rejects (error channel `never`).
 */
export const countSourceFilesNode = (dir: string, cap?: number): Promise<number> =>
  Effect.runPromise(
    (cap === undefined ? countSourceFiles(dir) : countSourceFiles(dir, cap)).pipe(
      Effect.provide(NodeFileSystem.layer),
    ),
  );

/**
 * Runnable: collect `.ts`/`.tsx` source paths under a real directory (RULE-012, cap
 * 10000). NEVER rejects (error channel `never`).
 */
export const collectSourceFilesNode = (
  dir: string,
  cap?: number,
): Promise<ReadonlyArray<string>> =>
  Effect.runPromise(
    (cap === undefined ? collectSourceFiles(dir) : collectSourceFiles(dir, cap)).pipe(
      Effect.provide(NodeFileSystem.layer),
    ),
  );
