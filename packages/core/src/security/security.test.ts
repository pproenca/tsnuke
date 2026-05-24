import { describe, expect, it } from "vitest";
import { isSafeGitRevision } from "./git-revision.js";
import { isInsideTempDir } from "./staged-files.js";
import {
  InvalidGlobPatternError,
  MAX_GLOB_PATTERN_WILDCARDS,
  validateGlobPattern,
} from "./glob.js";
import { sanitizeEnv } from "./env.js";
import { loadConfigPlugins } from "./plugins.js";
import type { TsDoctorConfig } from "../types.js";

describe("isSafeGitRevision (BC-15)", () => {
  it("accepts ordinary branch / sha / tag refs", () => {
    expect(isSafeGitRevision("main")).toBe(true);
    expect(isSafeGitRevision("origin/main")).toBe(true);
    expect(isSafeGitRevision("release/1.2.3")).toBe(true);
    expect(isSafeGitRevision("a1b2c3d")).toBe(true);
    expect(isSafeGitRevision("feature_x-1")).toBe(true);
  });

  it("rejects empty, flag-injection, dot-bounded, range, reflog, bad chars", () => {
    expect(isSafeGitRevision("")).toBe(false);
    expect(isSafeGitRevision("--upload-pack=x")).toBe(false); // arg injection
    expect(isSafeGitRevision("-main")).toBe(false);
    expect(isSafeGitRevision(".hidden")).toBe(false);
    expect(isSafeGitRevision("trailing.")).toBe(false);
    expect(isSafeGitRevision("a..b")).toBe(false); // range
    expect(isSafeGitRevision("HEAD@{1}")).toBe(false); // reflog
    expect(isSafeGitRevision("a b")).toBe(false); // space
    expect(isSafeGitRevision("a;rm -rf")).toBe(false); // shell metachar
  });
});

describe("isInsideTempDir (BC-16, Zip-Slip)", () => {
  const tmp = "/tmp/ts-doctor-XYZ";
  it("accepts paths that stay inside the temp dir", () => {
    expect(isInsideTempDir(tmp, "a.ts")).toBe(true);
    expect(isInsideTempDir(tmp, "nested/dir/a.ts")).toBe(true);
    expect(isInsideTempDir(tmp, "./a.ts")).toBe(true);
  });
  it("rejects traversal and absolute escapes", () => {
    expect(isInsideTempDir(tmp, "../escape.ts")).toBe(false);
    expect(isInsideTempDir(tmp, "../../etc/passwd")).toBe(false);
    expect(isInsideTempDir(tmp, "a/../../escape.ts")).toBe(false);
    expect(isInsideTempDir(tmp, "/etc/passwd")).toBe(false); // absolute
  });
});

describe("validateGlobPattern (BC-17, ReDoS caps)", () => {
  it("accepts a reasonable glob", () => {
    expect(() => validateGlobPattern("src/**/*.ts")).not.toThrow();
  });
  it("rejects a glob with too many wildcards (25 > 24)", () => {
    const pattern = "*".repeat(MAX_GLOB_PATTERN_WILDCARDS + 1);
    expect(() => validateGlobPattern(pattern)).toThrow(InvalidGlobPatternError);
  });
  it("rejects an over-long glob", () => {
    expect(() => validateGlobPattern("a".repeat(1025))).toThrow(
      InvalidGlobPatternError,
    );
  });
});

describe("sanitizeEnv (BC-19)", () => {
  it("strips NODE_OPTIONS, NODE_DEBUG and npm_config_*; keeps the rest", () => {
    const cleaned = sanitizeEnv({
      PATH: "/usr/bin",
      NODE_OPTIONS: "--require ./evil.js",
      NODE_DEBUG: "http",
      npm_config_registry: "http://evil",
      npm_config_ignore_scripts: "false",
      HOME: "/home/u",
    });
    expect(cleaned["NODE_OPTIONS"]).toBeUndefined();
    expect(cleaned["NODE_DEBUG"]).toBeUndefined();
    expect(cleaned["npm_config_registry"]).toBeUndefined();
    expect(cleaned["npm_config_ignore_scripts"]).toBeUndefined();
    expect(cleaned["PATH"]).toBe("/usr/bin");
    expect(cleaned["HOME"]).toBe("/home/u");
  });
  it("does not mutate the input", () => {
    const env = { NODE_OPTIONS: "x", PATH: "/bin" };
    sanitizeEnv(env);
    expect(env["NODE_OPTIONS"]).toBe("x");
  });
});

describe("loadConfigPlugins (BC-18, no plugin loading)", () => {
  it("a scanned-repo plugin entry loads NOTHING (RCE removed by construction)", () => {
    const config: TsDoctorConfig = { plugins: ["./evil.js"] };
    const result = loadConfigPlugins(config);
    expect(result.plugins).toEqual([]); // nothing required/loaded
    expect(result.ignored).toEqual(["./evil.js"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("./evil.js");
  });
  it("no plugins declared → empty everything", () => {
    const result = loadConfigPlugins({});
    expect(result.plugins).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
