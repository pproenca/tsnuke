/**
 * Production wiring — the prod runnable `diagnoseNode` over the real Node-backed
 * `FileSystem` + `Path` Layers, with the `Scope` bounded by `Effect.scoped` (mirrors the
 * config/discovery slices' `NodeContext`/`*Node` helpers).
 *
 * This is the ONLY module that references `@effect/platform-node`; `diagnose` itself stays
 * platform-agnostic (it depends on the `@effect/platform` SERVICE INTERFACES, not Node).
 * Tests provide an in-memory Layer for the SAME `FileSystem | Path` requirements, so
 * swapping disk for an in-memory map is a one-line Layer change.
 *
 * The `Scope` requirement (RULE-036: the engine's `ts.Program` lifetime) is discharged
 * HERE by `Effect.scoped` — so the Program is built, used, and RELEASED within the bounds
 * of each `diagnoseNode` call, never lingering into a subsequent run (the OOM cure legacy
 * never ran). The monorepo follow-up reuses the SAME pattern per-project (a `scopedProgram`
 * loop), so no Program from project N survives into project N+1.
 *
 * `diagnoseNode` may REJECT — `diagnose` can FAIL with `TsconfigNotFoundError` /
 * `NoTypeScriptProjectError` on its error channel (RULE-022); `runPromise` rejects with
 * that failure. A valid project resolves with a {@link DiagnoseResult}.
 */

import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { diagnose } from "./diagnose.js";
import type { RunEngineOptions } from "./runEngine.js";
import type { DiagnoseOptions, DiagnoseResult } from "./types.js";

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
 * Runnable: diagnose a TypeScript project from a real directory on disk. Resolves the
 * `FileSystem`/`Path` requirements with {@link NodeContext} and bounds the engine's
 * `Scope` with `Effect.scoped` (RULE-036 — the Program is released before this resolves).
 * REJECTS with {@link TsconfigNotFoundError} / {@link NoTypeScriptProjectError} when the
 * directory is not a valid TS project; resolves with a {@link DiagnoseResult} otherwise.
 */
export const diagnoseNode = (
  directory: string,
  options: DiagnoseOptions & { readonly memory?: RunEngineOptions["memory"] } = {},
): Promise<DiagnoseResult> =>
  Effect.runPromise(
    diagnose(directory, options).pipe(Effect.scoped, Effect.provide(NodeContext)),
  );
