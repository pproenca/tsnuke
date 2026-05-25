/**
 * Characterization + equivalence tests for the EFFECTFUL filesystem config loader
 * (`src/main/loadConfig.ts`, RULE-024). This is the first effectful slice, so this
 * suite also establishes the STUB-FILESYSTEM-LAYER test pattern the later effectful
 * slices (engine, discovery) will reuse.
 *
 * NO REAL DISK. Every test runs the loader with an in-memory `FileSystem` Layer
 * (`stubFsLayer`, below) backed by a `Map<absolutePath, fileContents>`: `exists`
 * returns whether the map has the key; `readFileString` returns the value (or fails
 * with a NotFound `PlatformError` so we also exercise the loader's error→fallback
 * mapping). The `Path` service is the real platform-agnostic `Path.layer` — it is a
 * pure string operation (no I/O), and using it (rather than stubbing `join`) proves
 * the loader's path-joining matches `node:path` semantics, the legacy contract.
 *
 * The loader VALIDATION is delegated to the pure `sanitizeConfig` (already proven
 * byte-equivalent to legacy by `equivalence.test.ts` over 2235 fixtures). What THIS
 * suite proves is the part the pure slice could not: the file-SELECTION /
 * package.json-FALLBACK / parse-error logic. The equivalence section pins that with a
 * frozen vendored copy of legacy `loadConfigWithWarnings` + `tryParseJson`
 * parameterized over a fake `{ existsSync, readFileSync }` backed by the SAME map.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as nodeJoin } from "node:path";
import { FileSystem, Path } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  loadConfig,
  loadConfigWithWarnings,
  loadConfigWithWarningsNode,
} from "../main/loadConfig.js";
import type { SanitizeResult } from "../main/sanitize.js";

// ===========================================================================
// STUB FILESYSTEM LAYER — backed by an in-memory Map<path, contents>.
// `FileSystem.layerNoop(partial)` builds a Layer providing a FileSystem whose
// methods are no-ops EXCEPT the ones we override. The loader only calls `exists`
// and `readFileString`, so those are the only two we implement. A missing key in
// `readFileString` fails with a real NotFound PlatformError, exercising the
// loader's PlatformError → "not present / unparseable" fallback (RULE-024).
// ===========================================================================

const stubFsLayer = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem> =>
  FileSystem.layerNoop({
    exists: (path: string) => Effect.succeed(files.has(path)),
    readFileString: (path: string) =>
      files.has(path)
        ? Effect.succeed(files.get(path)!)
        : Effect.fail(
            new SystemError({
              reason: "NotFound",
              module: "FileSystem",
              method: "readFileString",
              pathOrDescriptor: path,
            }),
          ),
  });

/** Full requirements (`FileSystem` + real `Path`) for the loader, in-memory. */
const testLayer = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
  Layer.merge(stubFsLayer(files), Path.layer);

/** Run the loader against an in-memory file set. Never rejects (RULE-024 is total). */
const runLoad = (
  dir: string,
  files: Record<string, string>,
): Promise<SanitizeResult> =>
  Effect.runPromise(
    loadConfigWithWarnings(dir).pipe(
      Effect.provide(testLayer(new Map(Object.entries(files)))),
    ),
  );

// POSIX join semantics (the test platform). `dir` is chosen so joined paths are
// stable keys for the in-memory map.
const DIR = "/proj";
const CONFIG_PATH = "/proj/tsnuke.config.json";
const PKG_PATH = "/proj/package.json";

// ===========================================================================
// 1. tsnuke.config.json present
// ===========================================================================
describe("loadConfigWithWarnings — tsnuke.config.json", () => {
  it("valid config.json → sanitized, no warnings", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: JSON.stringify({ failOn: "error", customRulesOnly: true }),
    });
    expect(result).toEqual({
      config: { failOn: "error", customRulesOnly: true },
      warnings: [],
    });
  });

  it("config.json with malformed fields → sanitized (dropped-with-warning, delegated to sanitizeConfig)", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: JSON.stringify({ failOn: "boom", customRulesOnly: 1 }),
    });
    expect(result).toEqual({
      config: {},
      warnings: [
        `Dropping "failOn": expected "error" | "warning" | "none".`,
        `Dropping "customRulesOnly": expected a boolean.`,
      ],
    });
  });

  it("unparseable config.json → empty config + the EXACT legacy warning", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: "{ not valid json",
    });
    expect(result).toEqual({
      config: {},
      warnings: [`Ignoring ${CONFIG_PATH}: could not parse as JSON.`],
    });
  });

  it("config.json that is valid JSON but not an object (e.g. an array) → sanitizeConfig's non-object handling", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: JSON.stringify([1, 2, 3]),
    });
    expect(result).toEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });
});

// ===========================================================================
// 2. package.json fallback (only when config.json is absent)
// ===========================================================================
describe("loadConfigWithWarnings — package.json#tsNuke fallback", () => {
  it("package.json with tsNuke present → sanitized", async () => {
    const result = await runLoad(DIR, {
      [PKG_PATH]: JSON.stringify({
        name: "x",
        tsNuke: { failOn: "warning", rules: { "no-any": "error" } },
      }),
    });
    expect(result).toEqual({
      config: { failOn: "warning", rules: { "no-any": "error" } },
      warnings: [],
    });
  });

  it("package.json WITHOUT a tsNuke key → empty config, no warnings (falls through)", async () => {
    const result = await runLoad(DIR, {
      [PKG_PATH]: JSON.stringify({ name: "x", version: "1.0.0" }),
    });
    expect(result).toEqual({ config: {}, warnings: [] });
  });

  it("package.json that is not an object → empty config, no warnings (falls through)", async () => {
    const result = await runLoad(DIR, {
      [PKG_PATH]: JSON.stringify([1, 2, 3]),
    });
    expect(result).toEqual({ config: {}, warnings: [] });
  });

  it("unparseable package.json → empty config, no warnings (legacy tryParseJson → undefined → !isObject → fall through)", async () => {
    const result = await runLoad(DIR, {
      [PKG_PATH]: "{ broken",
    });
    expect(result).toEqual({ config: {}, warnings: [] });
  });

  it("package.json#tsNuke that is malformed → sanitizeConfig drops fields with warnings", async () => {
    const result = await runLoad(DIR, {
      [PKG_PATH]: JSON.stringify({ tsNuke: { plugins: "not-an-array" } }),
    });
    expect(result).toEqual({
      config: {},
      warnings: [`Dropping "plugins": expected string[].`],
    });
  });
});

// ===========================================================================
// 3. neither present
// ===========================================================================
describe("loadConfigWithWarnings — neither file present", () => {
  it("empty directory → { config: {}, warnings: [] }", async () => {
    const result = await runLoad(DIR, {});
    expect(result).toEqual({ config: {}, warnings: [] });
  });
});

// ===========================================================================
// 4. precedence — config.json wins over package.json
// ===========================================================================
describe("loadConfigWithWarnings — precedence", () => {
  it("config.json takes precedence over package.json (package.json NOT read)", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: JSON.stringify({ failOn: "none" }),
      [PKG_PATH]: JSON.stringify({ tsNuke: { failOn: "error" } }),
    });
    expect(result).toEqual({ config: { failOn: "none" }, warnings: [] });
  });

  it("unparseable config.json wins (its warning, NOT the package.json fallback)", async () => {
    const result = await runLoad(DIR, {
      [CONFIG_PATH]: "{ broken",
      [PKG_PATH]: JSON.stringify({ tsNuke: { failOn: "error" } }),
    });
    expect(result).toEqual({
      config: {},
      warnings: [`Ignoring ${CONFIG_PATH}: could not parse as JSON.`],
    });
  });
});

// ===========================================================================
// 5. loadConfig (config-only projection)
// ===========================================================================
describe("loadConfig — returns only the config (legacy loadConfigWithWarnings(dir).config)", () => {
  it("projects to .config, dropping warnings", async () => {
    const files = new Map(
      Object.entries({ [CONFIG_PATH]: "{ broken" }),
    );
    const config = await Effect.runPromise(
      loadConfig(DIR).pipe(Effect.provide(testLayer(files))),
    );
    expect(config).toEqual({});
  });

  it("returns the sanitized config object on success", async () => {
    const files = new Map(
      Object.entries({
        [CONFIG_PATH]: JSON.stringify({ failOn: "error" }),
      }),
    );
    const config = await Effect.runPromise(
      loadConfig(DIR).pipe(Effect.provide(testLayer(files))),
    );
    expect(config).toEqual({ failOn: "error" });
  });
});

// ===========================================================================
// 6. PlatformError → fallback (RULE-024 never throws)
// ===========================================================================
describe("loadConfigWithWarnings — PlatformError handling", () => {
  it("a readFileString PlatformError on config.json (exists says yes, read fails) → parse-fail fallback (legacy tryParseJson catch)", async () => {
    // exists → true for config.json, but the map has NO contents for it, so the
    // stub's readFileString FAILS with NotFound. Legacy's tryParseJson catches the
    // readFileSync throw and returns undefined → "could not parse" warning.
    const layer = Layer.merge(
      FileSystem.layerNoop({
        exists: (path: string) => Effect.succeed(path === CONFIG_PATH),
        readFileString: (path: string) =>
          Effect.fail(
            new SystemError({
              reason: "PermissionDenied",
              module: "FileSystem",
              method: "readFileString",
              pathOrDescriptor: path,
            }),
          ),
      }),
      Path.layer,
    );
    const result = await Effect.runPromise(
      loadConfigWithWarnings(DIR).pipe(Effect.provide(layer)),
    );
    expect(result).toEqual({
      config: {},
      warnings: [`Ignoring ${CONFIG_PATH}: could not parse as JSON.`],
    });
  });

  it("an exists PlatformError is treated as 'absent' (loader never throws)", async () => {
    const layer = Layer.merge(
      FileSystem.layerNoop({
        exists: (path: string) =>
          Effect.fail(
            new SystemError({
              reason: "PermissionDenied",
              module: "FileSystem",
              method: "exists",
              pathOrDescriptor: path,
            }),
          ),
      }),
      Path.layer,
    );
    const result = await Effect.runPromise(
      loadConfigWithWarnings(DIR).pipe(Effect.provide(layer)),
    );
    expect(result).toEqual({ config: {}, warnings: [] });
  });
});

// ===========================================================================
// EQUIVALENCE PROOF — modern (stub-FS Layer) vs frozen legacy oracle.
//
// The oracle is a VERBATIM, FROZEN copy of legacy `tryParseJson` +
// `loadConfigWithWarnings` (`load-config.ts:156-196`), with `existsSync`/`readFileSync`
// parameterized as a fake backed by the SAME Map the modern loader reads. It calls the
// SAME pure `sanitizeConfig` (imported from the slice) so any difference isolates to
// the file-selection / fallback / parse-error logic — the only thing this slice adds
// over the already-proven pure core. (The legacy `node:path` `join` is reproduced with
// a POSIX join so paths match the stub keys, which the modern loader produces via the
// platform-agnostic Path.layer on this POSIX test host.)
// ===========================================================================

import { sanitizeConfig } from "../main/sanitize.js";

/** POSIX-style join, matching `node:path`.join on the (POSIX) test host. */
const posixJoin = (...parts: string[]): string =>
  parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, (m, off: number) => (off === 0 ? "/" : ""));

/** Frozen legacy oracle, parameterized over a fake fs backed by `files`. */
const legacyOracle = (
  dir: string,
  files: Map<string, string>,
): SanitizeResult => {
  const existsSync = (p: string): boolean => files.has(p);
  const readFileSync = (p: string): string => {
    if (!files.has(p)) {
      const err = new Error(`ENOENT: no such file, open '${p}'`);
      throw err;
    }
    return files.get(p)!;
  };

  // --- verbatim legacy tryParseJson (load-config.ts:156-162) ---
  const tryParseJson = (path: string): unknown => {
    try {
      return JSON.parse(readFileSync(path));
    } catch {
      return undefined;
    }
  };
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  // --- verbatim legacy loadConfigWithWarnings (load-config.ts:174-196) ---
  const configPath = posixJoin(dir, "tsnuke.config.json");
  if (existsSync(configPath)) {
    const raw = tryParseJson(configPath);
    if (raw === undefined) {
      return {
        config: {},
        warnings: [`Ignoring ${configPath}: could not parse as JSON.`],
      };
    }
    return sanitizeConfig(raw);
  }

  const pkgPath = posixJoin(dir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = tryParseJson(pkgPath);
    if (isObject(pkg) && pkg["tsNuke"] !== undefined) {
      return sanitizeConfig(pkg["tsNuke"]);
    }
  }

  return { config: {}, warnings: [] };
};

describe("EQUIVALENCE — modern loader (stub FS) deep-equals frozen legacy oracle", () => {
  // Crafted fixtures spanning every selection/fallback/parse-error branch. Each is a
  // map of absolute path → file contents (string-on-disk), as both modern and oracle see it.
  const fixtures: ReadonlyArray<{ name: string; files: Record<string, string> }> = [
    { name: "empty dir", files: {} },
    {
      name: "valid config.json",
      files: { [CONFIG_PATH]: JSON.stringify({ failOn: "error" }) },
    },
    {
      name: "config.json with mixed valid+invalid fields (warning order)",
      files: {
        [CONFIG_PATH]: JSON.stringify({
          ignore: { rules: ["a"], files: 5 },
          failOn: "nope",
          customRulesOnly: true,
          plugins: ["p"],
          rules: { "r-ok": "warn", "r-bad": "loud" },
          categories: { c: "off" },
        }),
      },
    },
    {
      name: "unparseable config.json",
      files: { [CONFIG_PATH]: "{ broken json" },
    },
    {
      name: "config.json is a JSON array (non-object)",
      files: { [CONFIG_PATH]: JSON.stringify([1, 2]) },
    },
    {
      name: "config.json is JSON null",
      files: { [CONFIG_PATH]: "null" },
    },
    {
      name: "config.json is a JSON string scalar",
      files: { [CONFIG_PATH]: JSON.stringify("hello") },
    },
    {
      name: "package.json with tsNuke",
      files: {
        [PKG_PATH]: JSON.stringify({ name: "x", tsNuke: { failOn: "warning" } }),
      },
    },
    {
      name: "package.json with malformed tsNuke",
      files: {
        [PKG_PATH]: JSON.stringify({ tsNuke: { plugins: 1, rules: { x: "bad" } } }),
      },
    },
    {
      name: "package.json without tsNuke",
      files: { [PKG_PATH]: JSON.stringify({ name: "x" }) },
    },
    {
      name: "package.json non-object (array)",
      files: { [PKG_PATH]: JSON.stringify([1]) },
    },
    {
      name: "unparseable package.json",
      files: { [PKG_PATH]: "{ broken" },
    },
    {
      name: "package.json#tsNuke explicitly null (key present, value null)",
      files: { [PKG_PATH]: JSON.stringify({ tsNuke: null }) },
    },
    {
      name: "BOTH present — config.json wins",
      files: {
        [CONFIG_PATH]: JSON.stringify({ failOn: "none" }),
        [PKG_PATH]: JSON.stringify({ tsNuke: { failOn: "error" } }),
      },
    },
    {
      name: "BOTH present, config.json unparseable — config.json STILL wins (warning, no fallback)",
      files: {
        [CONFIG_PATH]: "broken",
        [PKG_PATH]: JSON.stringify({ tsNuke: { failOn: "error" } }),
      },
    },
    {
      name: "BOTH present, config.json non-object — config.json branch taken (no pkg fallback)",
      files: {
        [CONFIG_PATH]: JSON.stringify([1]),
        [PKG_PATH]: JSON.stringify({ tsNuke: { failOn: "error" } }),
      },
    },
  ];

  // Guard: the oracle's `posixJoin` must reproduce the SAME paths the modern loader
  // probes via the real `Path.join` (else both sides could agree on a WRONG key and the
  // parity assertions would pass vacuously). Pins the oracle's path math (architecture review).
  it("posixJoin reproduces the loader's probed paths (oracle path-math guard)", () => {
    expect(posixJoin(DIR, "tsnuke.config.json")).toBe(CONFIG_PATH);
    expect(posixJoin(DIR, "package.json")).toBe(PKG_PATH);
  });

  for (const { name, files } of fixtures) {
    it(`oracle parity: ${name}`, async () => {
      const map = new Map(Object.entries(files));
      const modern = await runLoad(DIR, files);
      const oracle = legacyOracle(DIR, map);
      expect(modern).toStrictEqual(oracle);
    });
  }
});

describe("PRODUCTION Layer — loadConfigWithWarningsNode reads a REAL temp dir via NodeContext", () => {
  // The stub-FS suite above proves the loader LOGIC; this proves the PROD WIRING
  // (NodeFileSystem + NodePath layers) actually reads disk and never rejects — the
  // template every later effectful slice copies (architecture review HIGH). Uses an
  // OS temp dir (never the repo) and cleans up in `finally`.
  it("reads + sanitizes a real tsnuke.config.json", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-cfg-"));
    try {
      writeFileSync(
        nodeJoin(dir, "tsnuke.config.json"),
        JSON.stringify({ failOn: "warning", rules: { "no-any": "off" } }),
      );
      const result = await loadConfigWithWarningsNode(dir);
      expect(result.config.failOn).toBe("warning");
      expect(result.config.rules).toEqual({ "no-any": "off" });
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty and NEVER rejects for a dir with no config", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-cfg-"));
    try {
      const result = await loadConfigWithWarningsNode(dir);
      expect(result).toStrictEqual({ config: {}, warnings: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
