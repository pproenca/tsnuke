/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle.
 *
 * All five security guards are FROZEN verbatim (no deliberate behavioral
 * deviation — unlike the `score` slice's rounding change). The only deviation is
 * structural: `InvalidGlobPatternError` is now an `effect/Data` tagged error.
 * Its rejection PREDICATE (throws-or-not) and its observable surface are
 * unchanged, so we can prove byte-for-byte behavioral equivalence everywhere.
 *
 * Strategy:
 *   1. Vendored, frozen copies of the legacy guards as oracles (below), copied
 *      verbatim from legacy/.../security/{glob,git-revision,env,staged-files,
 *      plugins}.ts. For differential testing ONLY — do not "fix" them.
 *   2. Enumerated / boundary inputs per guard; assert modern === legacy. For the
 *      throwing guard (`validateGlobPattern`) equivalence is on the throws/not
 *      predicate (both raise on the same inputs); for the rest it is on the
 *      returned value (boolean / object).
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidGlobPatternError,
  isInsideTempDir,
  isSafeGitRevision,
  loadConfigPlugins,
  sanitizeEnv,
  validateGlobPattern,
} from "../main/index.js";

// ===========================================================================
// ORACLES — frozen copies of the legacy guards (legacy/.../security/*.ts).
// Verbatim. For differential testing ONLY.
// ===========================================================================

// --- glob.ts:13-47 -------------------------------------------------------
const LEGACY_MAX_GLOB_PATTERN_LENGTH = 1024;
const LEGACY_MAX_GLOB_PATTERN_WILDCARDS = 24;
function legacyValidateGlobPattern(pattern: string): void {
  if (pattern.length > LEGACY_MAX_GLOB_PATTERN_LENGTH) {
    throw new Error(
      `Glob pattern too long: ${pattern.length} > ${LEGACY_MAX_GLOB_PATTERN_LENGTH}.`,
    );
  }
  let wildcards = 0;
  for (const ch of pattern) {
    if (ch === "*" || ch === "?") wildcards++;
  }
  if (wildcards > LEGACY_MAX_GLOB_PATTERN_WILDCARDS) {
    throw new Error(
      `Glob pattern has too many wildcards: ${wildcards} > ${LEGACY_MAX_GLOB_PATTERN_WILDCARDS}.`,
    );
  }
}

// --- git-revision.ts:17-28 ----------------------------------------------
const LEGACY_ALLOWED_REF_CHARS = /^[A-Za-z0-9_./-]+$/;
function legacyIsSafeGitRevision(ref: string): boolean {
  if (ref.length === 0) return false;
  if (ref.startsWith("-")) return false;
  if (ref.startsWith(".") || ref.endsWith(".")) return false;
  if (ref.includes("..")) return false;
  if (ref.includes("@{")) return false;
  if (!LEGACY_ALLOWED_REF_CHARS.test(ref)) return false;
  return true;
}

// --- env.ts:13-29 --------------------------------------------------------
const LEGACY_STRIPPED_KEYS: ReadonlySet<string> = new Set([
  "NODE_OPTIONS",
  "NODE_DEBUG",
]);
const LEGACY_STRIPPED_PREFIX = "npm_config_";
function legacySanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (LEGACY_STRIPPED_KEYS.has(key)) continue;
    if (key.startsWith(LEGACY_STRIPPED_PREFIX)) continue;
    out[key] = value;
  }
  return out;
}

// --- staged-files.ts:21-37 ----------------------------------------------
function legacyIsInsideTempDir(tempDir: string, relPath: string): boolean {
  if (isAbsolute(relPath)) return false;
  const base = resolve(tempDir);
  const target = resolve(base, relPath);
  if (target === base) return true;
  const rel = relative(base, target);
  if (rel.length === 0) return true;
  if (rel === "..") return false;
  if (rel.startsWith(`..${sep}`)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

// --- plugins.ts:41-52 ----------------------------------------------------
interface LegacyResult {
  plugins: never[];
  ignored: string[];
  warnings: string[];
}
function legacyLoadConfigPlugins(config: { plugins?: string[] }): LegacyResult {
  const declared = Array.isArray(config.plugins) ? config.plugins : [];
  const ignored = declared.filter((p): p is string => typeof p === "string");
  const warnings = ignored.map(
    (name) =>
      `Ignoring config plugin "${name}": ts-fix v1 never loads plugins from a scanned repo (BC-18).`,
  );
  return { plugins: [], ignored, warnings };
}

// Helper: did `fn` throw?
const threw = (fn: () => void): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// ===========================================================================
// DIFFERENTIAL TESTS
// ===========================================================================

describe("equivalence — validateGlobPattern: modern throws iff legacy throws (RULE-014)", () => {
  it("agrees on the throws/not predicate across length & wildcard boundaries", () => {
    const cases: string[] = [
      "",
      "src/**/*.ts",
      "*".repeat(23),
      "*".repeat(24), // at the wildcard cap
      "*".repeat(25), // one over
      "?".repeat(24),
      "?".repeat(25),
      "*".repeat(13) + "?".repeat(11), // 24 mixed
      "*".repeat(13) + "?".repeat(12), // 25 mixed
      "a".repeat(1023),
      "a".repeat(1024), // at the length cap
      "a".repeat(1025), // one over
      "[abc]{x,y}".repeat(50), // brackets/braces are NOT wildcards
      "*".repeat(24) + "[a]", // 24 stars + non-wildcards, still under length cap
    ];
    let comparedCases = 0;
    let throwingCases = 0;
    for (const pattern of cases) {
      const modernThrew = threw(() => validateGlobPattern(pattern));
      const legacyThrew = threw(() => legacyValidateGlobPattern(pattern));
      expect(modernThrew, `mismatch for pattern of length ${pattern.length}`).toBe(
        legacyThrew,
      );
      if (modernThrew) {
        throwingCases++;
        // When it throws, the modern error is the tagged Data error.
        let caught: unknown;
        try {
          validateGlobPattern(pattern);
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(InvalidGlobPatternError);
      }
      comparedCases++;
    }
    expect(comparedCases).toBe(cases.length);
    expect(throwingCases).toBeGreaterThan(0); // the rejection path actually fired
  });
});

describe("equivalence — isSafeGitRevision: modern === legacy (BC-15)", () => {
  it("agrees on every enumerated ref", () => {
    const refs: string[] = [
      "",
      "main",
      "origin/main",
      "release/1.2.3",
      "a1b2c3d",
      "feature_x-1",
      "v1.0",
      "a",
      "-main",
      "--upload-pack=x",
      ".hidden",
      "trailing.",
      "a..b",
      "HEAD@{1}",
      "a b",
      "a;rm -rf",
      "HEAD~1",
      "HEAD^",
      "...",
      ".",
      "..",
      "a@b",
      "feature/sub.dir/thing",
      "UPPER/lower-123_x",
      "tab\tchar",
      "new\nline",
    ];
    for (const ref of refs) {
      expect(isSafeGitRevision(ref), `mismatch for ref ${JSON.stringify(ref)}`).toBe(
        legacyIsSafeGitRevision(ref),
      );
    }
  });
});

describe("equivalence — sanitizeEnv: modern === legacy (BC-19)", () => {
  it("produces the same sanitized env over enumerated inputs", () => {
    const envs: NodeJS.ProcessEnv[] = [
      {},
      { PATH: "/usr/bin", HOME: "/home/u" },
      { NODE_OPTIONS: "--require ./evil.js" },
      { NODE_DEBUG: "http" },
      { npm_config_registry: "http://evil", npm_config_ignore_scripts: "false" },
      {
        PATH: "/usr/bin",
        NODE_OPTIONS: "x",
        NODE_DEBUG: "y",
        npm_config_x: "z",
        NODE_OPTIONS_BACKUP: "keep",
        MY_NODE_OPTIONS: "keep",
        xnpm_config_x: "keep",
        npm_config_: "strip",
        EMPTY: "",
      },
    ];
    for (const env of envs) {
      expect(sanitizeEnv(env)).toEqual(legacySanitizeEnv(env));
    }
  });
});

describe("equivalence — isInsideTempDir: modern === legacy (BC-16)", () => {
  it("agrees over enumerated tempDir/relPath pairs", () => {
    const tmp = "/tmp/ts-fix-XYZ";
    const pairs: ReadonlyArray<readonly [string, string]> = [
      [tmp, "a.ts"],
      [tmp, "nested/dir/a.ts"],
      [tmp, "./a.ts"],
      [tmp, "."],
      [tmp, "a/../b.ts"],
      [tmp, "../escape.ts"],
      [tmp, "../../etc/passwd"],
      [tmp, "a/../../escape.ts"],
      [tmp, ".."],
      [tmp, "/etc/passwd"],
      [tmp, `${tmp}/a.ts`],
      ["/var/folders/abc", "deep/nested/file.tsx"],
      ["/var/folders/abc", "../../../etc/shadow"],
    ];
    for (const [dir, rel] of pairs) {
      expect(
        isInsideTempDir(dir, rel),
        `mismatch for (${dir}, ${rel})`,
      ).toBe(legacyIsInsideTempDir(dir, rel));
    }
  });
});

describe("equivalence — loadConfigPlugins: modern === legacy (RULE-039 / BC-18)", () => {
  it("produces identical { plugins, ignored, warnings } over enumerated configs", () => {
    const configs: ReadonlyArray<{ plugins?: string[] }> = [
      {},
      { plugins: [] },
      { plugins: ["./evil.js"] },
      { plugins: ["@scope/plug", "../up.js", "/abs/evil.js"] },
      { plugins: ["bare-name", "another"] },
    ];
    for (const config of configs) {
      const modern = loadConfigPlugins(config);
      const legacy = legacyLoadConfigPlugins(config);
      expect(modern.plugins).toEqual(legacy.plugins);
      expect(modern.ignored).toEqual(legacy.ignored);
      expect(modern.warnings).toEqual(legacy.warnings);
      // The cardinal invariant: never anything but [].
      expect(modern.plugins).toEqual([]);
    }
  });
});
