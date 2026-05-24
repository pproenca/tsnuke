import { describe, expect, it } from "vitest";
import {
  FlagError,
  parseFileLine,
  parseInspectFlags,
  validateModeFlags,
} from "./flags.js";

describe("parseInspectFlags", () => {
  it("uses sane defaults for empty argv", () => {
    const f = parseInspectFlags([]);
    expect(f.directory).toBe(".");
    expect(f.lint).toBe(true);
    expect(f.deadCode).toBe(true);
    expect(f.deep).toBeUndefined();
    expect(f.failOn).toBe("error");
    expect(f.format).toBe("pretty");
    expect(f.respectInlineDisables).toBe(true);
    expect(f.showScore).toBe(true);
  });

  it("parses a representative argv", () => {
    const f = parseInspectFlags([
      "packages/app",
      "--no-lint",
      "--deep",
      "--verbose",
      "--fail-on",
      "warning",
      "--project",
      "a, b ,c",
      "--format",
      "agent",
      "--no-respect-inline-disables",
    ]);
    expect(f.directory).toBe("packages/app");
    expect(f.lint).toBe(false);
    expect(f.deep).toBe(true);
    expect(f.verbose).toBe(true);
    expect(f.failOn).toBe("warning");
    expect(f.projects).toEqual(["a", "b", "c"]);
    expect(f.format).toBe("agent");
    expect(f.respectInlineDisables).toBe(false);
  });

  it("--json and --json-compact both set json + format=json", () => {
    expect(parseInspectFlags(["--json"]).json).toBe(true);
    const c = parseInspectFlags(["--json-compact"]);
    expect(c.json).toBe(true);
    expect(c.jsonCompact).toBe(true);
    expect(c.format).toBe("json");
  });

  it("--diff takes an optional base", () => {
    expect(parseInspectFlags(["--diff"]).diff).toEqual({ base: undefined });
    expect(parseInspectFlags(["--diff", "main"]).diff).toEqual({ base: "main" });
    // a following flag is NOT consumed as the base
    expect(parseInspectFlags(["--diff", "--verbose"]).diff).toEqual({ base: undefined });
  });

  it("--explain parses a file:line target", () => {
    const f = parseInspectFlags(["--explain", "src/a.ts:42"]);
    expect(f.explain).toEqual({ file: "src/a.ts", line: 42 });
  });

  it("-y/--yes both set yes", () => {
    expect(parseInspectFlags(["-y"]).yes).toBe(true);
    expect(parseInspectFlags(["--yes"]).yes).toBe(true);
  });

  it("throws on unknown flags", () => {
    expect(() => parseInspectFlags(["--nope"])).toThrow(FlagError);
  });

  it("throws on a second positional", () => {
    expect(() => parseInspectFlags(["a", "b"])).toThrow(FlagError);
  });

  it("throws on invalid --fail-on / --format values", () => {
    expect(() => parseInspectFlags(["--fail-on", "bogus"])).toThrow(FlagError);
    expect(() => parseInspectFlags(["--format", "bogus"])).toThrow(FlagError);
  });
});

describe("parseFileLine", () => {
  it("parses file:line", () => {
    expect(parseFileLine("a/b/c.ts:7")).toEqual({ file: "a/b/c.ts", line: 7 });
  });
  it("rejects malformed targets", () => {
    expect(() => parseFileLine("noColon")).toThrow(FlagError);
    expect(() => parseFileLine("file:abc")).toThrow(FlagError);
    expect(() => parseFileLine("file:0")).toThrow(FlagError);
  });
});

describe("validateModeFlags — RULE-042 incompatible combos", () => {
  it("rejects --staged + --diff", () => {
    expect(() => validateModeFlags(parseInspectFlags(["--staged", "--diff"]))).toThrow(FlagError);
  });

  it("rejects --score + --json", () => {
    expect(() => validateModeFlags(parseInspectFlags(["--score", "--json"]))).toThrow(FlagError);
  });

  it("rejects --pr-comment with --json or --score", () => {
    expect(() => validateModeFlags(parseInspectFlags(["--pr-comment", "--json"]))).toThrow(FlagError);
    expect(() => validateModeFlags(parseInspectFlags(["--pr-comment", "--score"]))).toThrow(FlagError);
  });

  it("rejects --annotations with --json or --score", () => {
    expect(() => validateModeFlags(parseInspectFlags(["--annotations", "--json"]))).toThrow(FlagError);
    expect(() => validateModeFlags(parseInspectFlags(["--annotations", "--score"]))).toThrow(FlagError);
  });

  it("rejects --explain with --json/--score/--annotations/--staged", () => {
    expect(() =>
      validateModeFlags(parseInspectFlags(["--explain", "a.ts:1", "--json"])),
    ).toThrow(FlagError);
    expect(() =>
      validateModeFlags(parseInspectFlags(["--explain", "a.ts:1", "--staged"])),
    ).toThrow(FlagError);
  });

  it("accepts a benign combination", () => {
    expect(() =>
      validateModeFlags(parseInspectFlags(["--diff", "main", "--fail-on", "warning"])),
    ).not.toThrow();
  });
});
