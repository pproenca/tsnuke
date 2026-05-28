/**
 * `diagnose()` — the public boundary that wires the whole pipeline end-to-end, as an
 * `Effect` (RULE-018 partial-honesty carried through). Faithful Effect port of legacy
 * `legacy/tsnuke/packages/core/src/index.ts:189-249` (`diagnose`) plus its helpers
 * `overridesFromConfig` (:168-176) and `readSourceFiles` (:154-165).
 *
 * Wires (the same order as legacy):
 *   discover → capabilities → load config → engine (Tier-1 real, Tier-2 gated)
 *   → filter pipeline → local score → DiagnoseResult.
 *
 * WHAT THE EFFECT PORT CHANGES vs legacy (see TRANSFORMATION_NOTES.md §2):
 *   - `diagnose` is now an `Effect<DiagnoseResult, TsNukeError, FileSystem | Path |
 *     Scope>` — NOT an `async` function. Discovery's typed errors
 *     (`TsconfigNotFoundError` / `NoTypeScriptProjectError`) flow on the ERROR CHANNEL
 *     (legacy `throw`); the file reads go through `@effect/platform` `FileSystem`/`Path`
 *     (legacy `node:fs`/`node:path`); the engine's `ts.Program` lives in the ambient
 *     `Scope` and is RELEASED when it closes (RULE-036). Provide a Layer at the edge —
 *     {@link ./node.ts} `diagnoseNode` wires `NodeContext` + `Effect.scoped`.
 *   - The score slice returns `{ score, band }`; this builds the legacy `ScoreResult`
 *     `{ score, label: band, partial: engineResult.scorePartial }` — the `band` → `label`
 *     map + the engine-owned `partial` wrap (RULE-018).
 *
 * `elapsedMilliseconds` is the ONE intentional non-deterministic field (wall-clock
 * timing) — it never feeds the score, which stays deterministic. It is sampled via
 * `Effect.sync(() => Date.now())` at the boundaries.
 */

import { FileSystem, Path } from "@effect/platform";
import { Effect, type Scope } from "effect";
import ts from "typescript";
import {
  collectSourceFiles,
  computeCapabilities,
  discoverTsProject,
  STRICT_FLAGS,
  type ProjectInfo,
} from "@tsnuke/discovery-effect";
import type { Capability } from "@tsnuke/contracts-effect";
import { loadConfig, loadFalsePositives } from "@tsnuke/config-effect";
import { computeScore } from "@tsnuke/score-effect";
import { runFilterPipeline, type DiagnosticWithTags } from "@tsnuke/filter-pipeline-effect";
import type { TsNukeConfig } from "@tsnuke/contracts-effect";
import type { Severity } from "@tsnuke/engine-plan-effect";
import type { SeverityOverrides } from "@tsnuke/engine-plan-effect";
import type {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "@tsnuke/errors-effect";
import { runEngine, type RunEngineOptions, type SourceFileInput } from "./runEngine.js";
import { safeEmit } from "./progress.js";
import type { DiagnoseOptions, DiagnoseResult, OnProgress, ScoreResult } from "./types.js";

/** Source file extensions read for analysis (legacy `SOURCE_EXTENSIONS`, index.ts:151). */
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx"]);

/** Lowercase file extension (incl. dot), or "" if none — mirrors `node:path` `extname`. */
const extnameOf = (filePath: string): string => {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const base = slash === -1 ? filePath : filePath.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
};

/**
 * Read the files to analyze (full project or a narrowed include set) — port of legacy
 * `readSourceFiles` (index.ts:154-165). Effectful: each file's text is read via
 * `@effect/platform` `FileSystem.readFileString` (legacy `readFileSync`). A file we can't
 * read is SILENTLY skipped (never fatal) — legacy's per-file `try/catch`, here a
 * `PlatformError → drop` via `Effect.option`. Non-`.ts`/`.tsx` paths are skipped first.
 */
const readSourceFiles = (
  includePaths: readonly string[],
): Effect.Effect<SourceFileInput[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const out: SourceFileInput[] = [];
    for (const filePath of includePaths) {
      if (!SOURCE_EXTENSIONS.has(extnameOf(filePath))) continue;
      const text = yield* fs
        .readFileString(filePath, "utf8")
        .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
      if (text !== undefined) out.push({ filePath, text });
    }
    return out;
  });

/**
 * Resolve the project's TS compiler options via the compiler's own parser, so the
 * Tier-2 `ts.Program` (built inside `runEngine`) sees the same configuration `tsc`
 * sees: JSX setup, `paths` aliases, `lib`/`target`, and the strict-family flags. With
 * the prior hardcode, any project with `jsx`, `@/…` path aliases, or non-default
 * `lib`s reported phantom errors → `typecheckOk = false` → Tier-2 silently skipped on
 * every non-trivial codebase.
 *
 * Reads through `@effect/platform` so an in-memory test FS works the same as disk.
 * Returns `undefined` when the config can't be located or parsed — the engine then
 * falls back to {@link DEFAULT_COMPILER_OPTIONS}.
 */
const resolveProjectCompilerOptions = (
  directory: string,
): Effect.Effect<ts.CompilerOptions | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tsconfigPath = path.join(directory, "tsconfig.json");
    const text = yield* fs
      .readFileString(tsconfigPath, "utf8")
      .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
    if (text === undefined) return undefined;
    const { config, error } = ts.parseConfigFileTextToJson(tsconfigPath, text);
    if (error !== undefined || config === undefined) return undefined;
    const parsed = ts.parseJsonConfigFileContent(
      config as object,
      ts.sys,
      directory,
      undefined,
      tsconfigPath,
    );
    // Strip emit-mode-only flags: tsnuke uses the Program as a one-shot type-checker,
    // so build-info / emit-driver flags become phantom errors (e.g. `incremental: true`
    // without `tsBuildInfoFile` → TS5074, dropping `typecheckOk` to false). Force
    // `noEmit: true` for the same reason — we never write declaration / source files.
    const { incremental, tsBuildInfoFile, composite, ...rest } = parsed.options;
    return { ...rest, noEmit: true };
  });

/**
 * Union strict-family capability tokens into `caps` from a fully-resolved
 * `ts.CompilerOptions` (RULE-021 reconciliation). `ts.parseJsonConfigFileContent`
 * walks the `extends` chain to arbitrary depth, so its `options.strict`/etc. reflect
 * inherited values that discovery's shallow one-level walk would miss.
 *
 * The inverted-gating CFG strictness rules (`enable-strict`, `enable-no-unchecked-…`)
 * fire when their `disabledBy` token is absent (RULE-020). Reconciling here makes them
 * see the same compilerOptions `tsc` does — eliminating the false-positive class where
 * a project inherits `strict: true` through a base config.
 *
 * Pure; never removes a token, only adds. (Discovery's own derivation stays
 * authoritative for everything else — module system, kind, build tool — so the existing
 * RULE-021 contract is preserved.)
 */
const reconcileStrictCaps = (
  caps: ReadonlySet<Capability>,
  compilerOptions: ts.CompilerOptions,
): Set<Capability> => {
  const out = new Set<Capability>(caps);
  for (const flag of STRICT_FLAGS) {
    if (compilerOptions[flag] === true) out.add(flag);
  }
  return out;
};

/**
 * Build the per-rule severity-override map from config (id → sev | "off") — port of
 * legacy `overridesFromConfig` (index.ts:168-176), preserving the `warn` → `warning`
 * normalization (RULE-040 vocabulary split). PURE.
 */
export const overridesFromConfig = (
  rules: Record<string, "error" | "warn" | "off"> | undefined,
): SeverityOverrides =>
  new Map<string, Severity | "off">(
    Object.entries(rules ?? {}).map(([id, value]) => [
      id,
      value === "warn" ? "warning" : value,
    ]),
  );

/**
 * Diagnose a single TypeScript project (the public boundary) — as an `Effect`.
 *
 * Wires: discover → capabilities → config → engine (Tier-1 real; Tier-2 gated on
 * `typecheck:ok` AND `deep !== false` AND the RULE-013 memory guard) → filter pipeline →
 * local score. `scorePartial` is true whenever Tier-2 was skipped (RULE-018).
 *
 * Error channel: discovery's typed `TsconfigNotFoundError`/`NoTypeScriptProjectError`
 * (config loading + engine are total — they never fail). Requirements: `FileSystem` +
 * `Path` (the file reads + discovery) and `Scope` (the engine's Program lifetime,
 * RULE-036). Provide a Layer + `Effect.scoped` at the edge ({@link ./node.ts}).
 *
 * @param directory  the project root to analyze
 * @param options    `deep` / `includePaths` / `respectInlineDisables` + the RULE-013
 *                   memory guard (forwarded to {@link runEngine})
 */
export const diagnose: (
  directory: string,
  options?: DiagnoseOptions & { readonly memory?: RunEngineOptions["memory"] },
) => Effect.Effect<
  DiagnoseResult,
  TsconfigNotFoundError | NoTypeScriptProjectError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> = Effect.fn("Engine.diagnose")(
  function* (
    directory: string,
    options: DiagnoseOptions & { readonly memory?: RunEngineOptions["memory"] } = {},
  ) {
    const startedAt = yield* Effect.sync(() => Date.now());

    const path = yield* Path.Path;
    const onProgress = options.onProgress;
    const emit = (event: Parameters<OnProgress>[0]): void => safeEmit(onProgress, event);

    const discoverStartedAt = Date.now();
    const project: ProjectInfo = yield* discoverTsProject(directory);
    emit({ kind: "discovered", directory: project.rootDirectory, elapsedMs: Date.now() - discoverStartedAt });
    const caps = computeCapabilities(project);
    const config: TsNukeConfig =
      options.config ?? (yield* loadConfig(directory));

    const ignoredTags = new Set(config.ignore?.tags ?? []);
    const overrides = overridesFromConfig(config.rules);

    // Diff/staged modes pass an explicit include set; a full scan enumerates the
    // project's source tree (discovery's effectful `collectSourceFiles`).
    const readStartedAt = Date.now();
    const includePaths =
      options.includePaths ?? (yield* collectSourceFiles(project.rootDirectory));
    const files = yield* readSourceFiles(includePaths);
    emit({ kind: "reading-files", count: files.length, elapsedMs: Date.now() - readStartedAt });

    const projectCompilerOptions = yield* resolveProjectCompilerOptions(
      project.rootDirectory,
    );

    // Reconcile capability tokens with the TS compiler's view of strictness. Discovery's
    // own `extends` walk is shallow (one level), so a project that inherits `strict` etc.
    // through a multi-level chain (e.g. `extends: "@vercel/style-guide/typescript/next"`
    // which itself extends `@tsconfig/strictest`) loses the token and the inverted-gating
    // CFG strictness rules fire as false positives. `ts.parseJsonConfigFileContent` already
    // resolved the full chain when building `projectCompilerOptions` — surface every
    // strict-family flag it proved true as the matching capability token here, so the CFG
    // rules' `disabledBy` gate sees the same world as `tsc`.
    const reconciledCaps = projectCompilerOptions !== undefined
      ? reconcileStrictCaps(caps, projectCompilerOptions)
      : caps;

    const engineResult = yield* runEngine(
      files,
      reconciledCaps,
      ignoredTags,
      overrides,
      options.deep,
      {
        configFilePath: path.join(project.rootDirectory, "tsconfig.json"),
        ...(projectCompilerOptions !== undefined
          ? { compilerOptions: projectCompilerOptions }
          : {}),
        ...(options.memory !== undefined ? { memory: options.memory } : {}),
        ...(onProgress !== undefined ? { onProgress } : {}),
      },
    );

    // Filter pipeline (BC-11). Carry source text for the inline-disable stage. PURE.
    // P5: load project-local `.tsnuke/false-positives.md` (empty array if absent)
    // and pass alongside the built-in framework defaults so user-authored
    // suppressions stack with what tsnuke ships.
    const sources = new Map<string, string>(files.map((f) => [f.filePath, f.text]));
    const projectFalsePositives = yield* loadFalsePositives(project.rootDirectory);
    const filtered = runFilterPipeline(
      engineResult.diagnostics as DiagnosticWithTags[],
      config,
      {
        respectInlineDisables: options.respectInlineDisables !== false,
        sources,
        frameworkSuppressions: projectFalsePositives,
      },
    );

    // Local, deterministic score (BC-01..04). The slice returns `{ score, band }`; build
    // the legacy `ScoreResult` `{ score, label, partial }` — `band` → `label`, and wrap
    // the engine's `scorePartial` (RULE-018: the score type stays partial-free).
    const { score, band } = computeScore(filtered);
    const scoreResult: ScoreResult = {
      score,
      label: band,
      partial: engineResult.scorePartial,
    };
    emit({ kind: "scoring", score, partial: engineResult.scorePartial });

    const elapsedMilliseconds = (yield* Effect.sync(() => Date.now())) - startedAt;
    emit({ kind: "done", elapsedMs: elapsedMilliseconds });

    const result: DiagnoseResult = {
      diagnostics: filtered,
      score: scoreResult,
      scorePartial: engineResult.scorePartial,
      skippedChecks: engineResult.skippedChecks,
      project,
      elapsedMilliseconds,
      ...(Object.keys(engineResult.skippedCheckReasons).length > 0
        ? { skippedCheckReasons: engineResult.skippedCheckReasons }
        : {}),
      ...(engineResult.typecheckErrors !== undefined && engineResult.typecheckErrors.length > 0
        ? { typecheckErrors: engineResult.typecheckErrors }
        : {}),
    };
    return result;
  },
);
