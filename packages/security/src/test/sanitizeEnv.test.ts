/**
 * Characterization tests for `sanitizeEnv` — BC-19.
 *
 * Any subprocess (git, or a future tsgolint engine) is spawned with a sanitized
 * environment: strip the EXACT keys `NODE_OPTIONS` and `NODE_DEBUG`
 * (code-injection / behavior-override vectors) and EVERY `npm_config_*` key
 * (can redirect installs / registries / scripts). FROZEN verbatim.
 *
 * Pure: returns a shallow copy and does NOT mutate the input. Keeps everything
 * else verbatim, including falsy values.
 *
 * DORMANT (RULE-027): no subprocess spawn calls this yet — see Follow-ups.
 */

import { describe, expect, it } from "vitest";
import { sanitizeEnv } from "../main/index.js";

describe("sanitizeEnv — BC-19 (strips the exact dangerous keys + prefix)", () => {
  it("strips NODE_OPTIONS, NODE_DEBUG and every npm_config_*; keeps the rest", () => {
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

  it("strips ONLY the exact keys — a similarly-named key is kept", () => {
    // `NODE_OPTIONS_BACKUP` is not exactly `NODE_OPTIONS`, and `xnpm_config_x`
    // does not START with `npm_config_`, so both survive.
    const cleaned = sanitizeEnv({
      NODE_OPTIONS_BACKUP: "keep-me",
      MY_NODE_OPTIONS: "keep-me-too",
      xnpm_config_x: "kept",
      npm_config_: "stripped (prefix matches with empty suffix)",
    });
    expect(cleaned["NODE_OPTIONS_BACKUP"]).toBe("keep-me");
    expect(cleaned["MY_NODE_OPTIONS"]).toBe("keep-me-too");
    expect(cleaned["xnpm_config_x"]).toBe("kept");
    // The bare prefix `npm_config_` itself starts with the prefix -> stripped.
    expect(cleaned["npm_config_"]).toBeUndefined();
  });

  it("keeps keys whose values are empty strings (only the key name matters)", () => {
    const cleaned = sanitizeEnv({ PATH: "", EMPTY: "" });
    expect(cleaned["PATH"]).toBe("");
    expect(cleaned["EMPTY"]).toBe("");
  });

  it("returns an empty object for an empty env", () => {
    expect(sanitizeEnv({})).toEqual({});
  });
});

describe("sanitizeEnv — BC-19 (purity: no mutation)", () => {
  it("does not mutate the input object", () => {
    const env = { NODE_OPTIONS: "x", PATH: "/bin" };
    const cleaned = sanitizeEnv(env);
    expect(env["NODE_OPTIONS"]).toBe("x"); // input unchanged
    expect(cleaned["NODE_OPTIONS"]).toBeUndefined(); // output stripped
    expect(cleaned).not.toBe(env); // distinct object reference
  });

  it("the returned object is a distinct shallow copy", () => {
    const env = { PATH: "/bin", HOME: "/home" };
    const cleaned = sanitizeEnv(env);
    expect(cleaned).not.toBe(env);
    expect(cleaned).toEqual({ PATH: "/bin", HOME: "/home" });
  });
});
