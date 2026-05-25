/**
 * The EFFECTFUL filesystem config loader — `loadConfigWithWarnings` (RULE-024:
 * lenient config loading, drop-not-throw). Source of truth (READ-ONLY):
 * `legacy/ts-fix/packages/core/src/load-config.ts:156-196`
 * (`tryParseJson` + `loadConfig` + `loadConfigWithWarnings`).
 *
 * THIS IS THE FIRST GENUINELY-EFFECTFUL SLICE in the modernization. Where the pure
 * core ({@link sanitizeConfig}, `sanitize.ts`) is a plain synchronous function, the
 * loader does real I/O (read a directory's `tsfix.config.json`, else
 * `package.json#tsFix`), so it is modeled as an `Effect<...>` over the
 * `@effect/platform` `FileSystem` + `Path` services — NOT `node:fs`/`node:path`
 * directly. The dependencies are declared in the Effect's REQUIREMENTS channel and
 * satisfied by a Layer at the edge: `NodeFileSystem.layer` + `NodePath.layer` in
 * production (see {@link loadConfigNode} / {@link loadConfigWithWarningsNode}), and a
 * tiny in-memory stub Layer in tests (no real disk). This Layer pattern is the one
 * the later effectful slices (engine, discovery) will reuse for ALL file reads.
 *
 * CONTRACT (RULE-024 — NEVER throws). The error channel is `never`: every
 * `PlatformError` (a missing file, an unreadable file) is mapped to the same
 * fallback legacy produced from `existsSync` returning `false` / `tryParseJson`
 * returning `undefined`. JSON that fails to parse yields the EXACT legacy warning
 * `Ignoring ${configPath}: could not parse as JSON.` and an empty config. The file
 * SELECTION order (`tsfix.config.json` first, then `package.json#tsFix`), the
 * fallback values, the warning text, and the `${configPath}` format are all part of
 * the contract and are reproduced verbatim — proven by the differential in
 * `src/test/loadConfig.test.ts` against a frozen vendored legacy oracle.
 *
 * ALL validation is DELEGATED to the pure {@link sanitizeConfig} (imported from
 * `./sanitize.js`); the loader only decides WHICH file (if any) to read and how to
 * parse it. The pure sanitizer is reviewed + final and is NOT touched here.
 */

import { Effect, Either, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { sanitizeConfig, type SanitizeResult } from "./sanitize.js";

/**
 * Read a file as text and `JSON.parse` it (legacy `tryParseJson`,
 * `load-config.ts:156-162`). Total — never fails the Effect. A `readFileString`
 * `PlatformError` (the file vanished between `exists` and read, or is unreadable) OR
 * a `JSON.parse` throw both collapse to `undefined`, exactly as legacy's `try/catch`
 * around `readFileSync` + `JSON.parse` did. Returns the parsed value, or `undefined`
 * when it could not be read/parsed.
 */
const tryParseJson = (
  path: string,
): Effect.Effect<unknown, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    // PlatformError (e.g. NotFound / PermissionDenied) → `undefined`, matching
    // legacy's `catch` over `readFileSync`. `Effect.orElseSucceed` discards the
    // typed error and yields the fallback, keeping the error channel `never`.
    const text = yield* fs
      .readFileString(path, "utf8")
      .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
    if (text === undefined) return undefined;
    // `JSON.parse` can throw on malformed text — capture that synchronously with
    // `Either.try` (no I/O), mirroring legacy's `try { JSON.parse(...) } catch`.
    const parsed = Either.try(() => JSON.parse(text) as unknown);
    return Either.isRight(parsed) ? parsed.right : undefined;
  });

/** Is this a plain (non-array, non-null) object? Mirrors legacy `isObject`. */
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Load + sanitize config from a directory, surfacing warnings (RULE-024).
 *
 * Port of legacy `loadConfigWithWarnings` (`load-config.ts:174-196`):
 *   1. If `${dir}/tsfix.config.json` EXISTS → parse it; unparseable →
 *      `{ config: {}, warnings: ["Ignoring <path>: could not parse as JSON."] }`;
 *      else → `sanitizeConfig(parsed)`.
 *   2. Else if `${dir}/package.json` EXISTS → parse it; if it is an object with a
 *      `tsFix` key → `sanitizeConfig(pkg.tsFix)`. (A non-object pkg, or one
 *      without `tsFix`, falls through.)
 *   3. Else → `{ config: {}, warnings: [] }`.
 *
 * Error channel `never`: a `PlatformError` from `exists`/`readFileString` is treated
 * as "not present / unparseable" — the loader NEVER throws out (RULE-024). Requires
 * the `FileSystem` + `Path` services; provide a Layer at the edge.
 */
export const loadConfigWithWarnings = Effect.fn("Config.loadWithWarnings")(
  function* (dir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // A failed `exists` (PlatformError) is treated as "absent", matching legacy
    // where `existsSync` returns `false` rather than throwing.
    const exists = (p: string): Effect.Effect<boolean> =>
      fs.exists(p).pipe(Effect.orElseSucceed(() => false));

    const configPath = path.join(dir, "tsfix.config.json");
    if (yield* exists(configPath)) {
      const raw = yield* tryParseJson(configPath);
      if (raw === undefined) {
        return {
          config: {},
          warnings: [`Ignoring ${configPath}: could not parse as JSON.`],
        } satisfies SanitizeResult;
      }
      return sanitizeConfig(raw);
    }

    const pkgPath = path.join(dir, "package.json");
    if (yield* exists(pkgPath)) {
      const pkg = yield* tryParseJson(pkgPath);
      if (isObject(pkg) && pkg["tsFix"] !== undefined) {
        return sanitizeConfig(pkg["tsFix"]);
      }
    }

    return { config: {}, warnings: [] } satisfies SanitizeResult;
  },
);

/**
 * Load config from a directory, returning ONLY the sanitized config (RULE-024).
 * Port of legacy `loadConfig` (`load-config.ts:169-171`):
 * `loadConfigWithWarnings(dir).config`. Same requirements/error channel as
 * {@link loadConfigWithWarnings}.
 */
export const loadConfig = Effect.fn("Config.load")(function* (dir: string) {
  return (yield* loadConfigWithWarnings(dir)).config;
});

/**
 * The production Layer: the real Node-backed `FileSystem` + `Path` services. This is
 * the ONLY place `@effect/platform-node` is referenced — the loader itself stays
 * platform-agnostic (it depends on the service interfaces, not Node). Tests provide a
 * different (in-memory) Layer for the same two services.
 */
export const NodeContext: Layer.Layer<FileSystem.FileSystem | Path.Path> =
  Layer.merge(NodeFileSystem.layer, NodePath.layer);

/**
 * Runnable convenience: load config from a real directory on disk, resolving the
 * `FileSystem`/`Path` requirements with {@link NodeContext}. NEVER rejects — RULE-024
 * is total, so the returned `Promise` always resolves with a {@link SanitizeResult}.
 */
export const loadConfigWithWarningsNode = (
  dir: string,
): Promise<SanitizeResult> =>
  Effect.runPromise(loadConfigWithWarnings(dir).pipe(Effect.provide(NodeContext)));

/**
 * Runnable convenience: load config from a real directory, returning only the
 * sanitized config. Always resolves (RULE-024 is total). See
 * {@link loadConfigWithWarningsNode}.
 */
export const loadConfigNode = (
  dir: string,
): Promise<SanitizeResult["config"]> =>
  Effect.runPromise(loadConfig(dir).pipe(Effect.provide(NodeContext)));
