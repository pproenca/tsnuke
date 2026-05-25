/**
 * RULE-028 — CLI mutually-exclusive flag validation.
 *
 * Two angles, both behavioral:
 *   1. The PURE predicate `validateModeFlags` (flags.ts) rejects exactly the legacy
 *      mutually-exclusive set with the SAME message text, and accepts valid combos.
 *   2. `resolveInspectFlags` (the `Options.mapEffect` body that makes RULE-028 an
 *      `Options` CONSTRAINT) FAILS with a `@effect/cli` `ValidationError` carrying that
 *      same message — i.e. the parser rejects contradictory combos. This is the
 *      "RULE-028 becomes Options constraints" contract. Plus the malformed `<file>:<line>`
 *      and the `--format`/`--fail-on` domain (the latter enforced by `Options.choice`,
 *      asserted via the resolved value here; an out-of-set value can't reach this body).
 */

import { ValidationError } from "@effect/cli";
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  FlagError,
  parseFileLine,
  validateModeFlags,
  type InspectFlags,
} from "../main/flags.js";
import { resolveInspectFlags } from "../main/inspectCommand.js";

/** A valid, default-ish flag record to mutate per case. */
const baseFlags = (over: Partial<InspectFlags> = {}): InspectFlags => ({
  directory: ".",
  lint: true,
  deadCode: true,
  deep: undefined,
  verbose: false,
  respectInlineDisables: true,
  score: false,
  showScore: true,
  json: false,
  jsonCompact: false,
  format: "pretty",
  annotations: false,
  prComment: false,
  fix: false,
  yes: false,
  full: false,
  projects: [],
  diff: undefined,
  staged: false,
  failOn: "error",
  explain: undefined,
  why: undefined,
  ...over,
});

const expectRejected = (over: Partial<InspectFlags>, message: string): void => {
  expect(() => validateModeFlags(baseFlags(over))).toThrowError(message);
};

describe("RULE-028 validateModeFlags — rejections (legacy set, verbatim messages)", () => {
  it("rejects --staged + --diff", () => {
    expectRejected(
      { staged: true, diff: { base: undefined } },
      "--staged and --diff are mutually exclusive.",
    );
  });

  it("rejects --score + --json", () => {
    expectRejected(
      { score: true, json: true },
      "--score and --json are mutually exclusive.",
    );
  });

  it("rejects --pr-comment + --json", () => {
    expectRejected(
      { prComment: true, json: true },
      "--pr-comment cannot be combined with --json or --score.",
    );
  });

  it("rejects --pr-comment + --score", () => {
    expectRejected(
      { prComment: true, score: true },
      "--pr-comment cannot be combined with --json or --score.",
    );
  });

  it("rejects --annotations + --json", () => {
    expectRejected(
      { annotations: true, json: true },
      "--annotations cannot be combined with --json or --score.",
    );
  });

  it("rejects --annotations + --score", () => {
    expectRejected(
      { annotations: true, score: true },
      "--annotations cannot be combined with --json or --score.",
    );
  });

  it("rejects --explain + --json / --score / --annotations / --staged", () => {
    const expl = { explain: { file: "a.ts", line: 1 } };
    const msg =
      "--explain cannot be combined with --json, --score, --annotations, or --staged.";
    expectRejected({ ...expl, json: true }, msg);
    expectRejected({ ...expl, score: true }, msg);
    expectRejected({ ...expl, annotations: true }, msg);
    expectRejected({ ...expl, staged: true }, msg);
  });
});

describe("RULE-028 validateModeFlags — accepted (valid combos)", () => {
  it("accepts plain defaults", () => {
    expect(() => validateModeFlags(baseFlags())).not.toThrow();
  });
  it("accepts --diff alone, --staged alone", () => {
    expect(() => validateModeFlags(baseFlags({ diff: { base: "main" } }))).not.toThrow();
    expect(() => validateModeFlags(baseFlags({ staged: true }))).not.toThrow();
  });
  it("accepts --json alone, --score alone", () => {
    expect(() => validateModeFlags(baseFlags({ json: true }))).not.toThrow();
    expect(() => validateModeFlags(baseFlags({ score: true }))).not.toThrow();
  });
  it("accepts --explain alone, --fix + --json", () => {
    expect(() =>
      validateModeFlags(baseFlags({ explain: { file: "a.ts", line: 9 } })),
    ).not.toThrow();
    expect(() => validateModeFlags(baseFlags({ fix: true, json: true }))).not.toThrow();
  });
});

describe("parseFileLine — malformed <file>:<line> (RULE-028)", () => {
  it("parses a valid target", () => {
    expect(parseFileLine("src/a.ts:42")).toEqual({ file: "src/a.ts", line: 42 });
  });
  it("splits on the LAST colon (tolerates path colons)", () => {
    expect(parseFileLine("C:/x/a.ts:7")).toEqual({ file: "C:/x/a.ts", line: 7 });
  });
  it("rejects a missing line", () => {
    expect(() => parseFileLine("src/a.ts")).toThrow(FlagError);
  });
  it("rejects a non-integer line", () => {
    expect(() => parseFileLine("src/a.ts:x")).toThrow(/integer line/);
  });
  it("rejects a non-positive line", () => {
    expect(() => parseFileLine("src/a.ts:0")).toThrow(/>= 1/);
  });
});

// ── The Options-constraint view: resolveInspectFlags fails the parser-decode ──────────

/** The raw options record `resolveInspectFlags` consumes, with all defaults. */
const rawDefaults = () => ({
  lint: Option.none<boolean>(),
  deadCode: Option.none<boolean>(),
  deep: Option.none<boolean>(),
  verbose: false,
  respectInlineDisables: Option.none<boolean>(),
  format: "pretty" as const,
  failOn: "error" as const,
  score: false,
  showScore: Option.none<boolean>(),
  json: false,
  jsonCompact: false,
  annotations: false,
  prComment: false,
  fix: false,
  yes: false,
  full: false,
  project: Option.none<string>(),
  diff: false,
  diffBase: Option.none<string>(),
  staged: false,
  explain: Option.none<string>(),
  why: Option.none<string>(),
});

describe("RULE-028 as an Options CONSTRAINT (resolveInspectFlags → ValidationError)", () => {
  it("REJECTS --score + --json at parse time with the legacy message", () => {
    const exit = Effect.runSyncExit(
      resolveInspectFlags({ ...rawDefaults(), score: true, json: true }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const text = JSON.stringify(exit.cause);
      expect(text).toContain("--score and --json are mutually exclusive.");
    }
  });

  it("REJECTS --explain + --staged at parse time", () => {
    const exit = Effect.runSyncExit(
      resolveInspectFlags({
        ...rawDefaults(),
        explain: Option.some("a.ts:1"),
        staged: true,
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("REJECTS a malformed --explain <file:line> at parse time", () => {
    const exit = Effect.runSyncExit(
      resolveInspectFlags({ ...rawDefaults(), explain: Option.some("not-a-target") }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(ValidationError.isValidationError).toBeTypeOf("function");
      expect(JSON.stringify(exit.cause)).toContain("Expected <file:line>");
    }
  });

  it("ACCEPTS valid defaults and resolves the tri-state / format / fail-on", () => {
    const flags = Effect.runSync(resolveInspectFlags(rawDefaults()));
    expect(flags.deep).toBeUndefined(); // RULE-035 auto
    expect(flags.format).toBe("pretty");
    expect(flags.failOn).toBe("error");
    expect(flags.lint).toBe(true);
    expect(flags.showScore).toBe(true);
  });

  it("--json-compact implies json; --format json implies json", () => {
    const a = Effect.runSync(resolveInspectFlags({ ...rawDefaults(), jsonCompact: true }));
    expect(a.json).toBe(true);
    expect(a.format).toBe("json");
    const b = Effect.runSync(resolveInspectFlags({ ...rawDefaults(), format: "json" }));
    expect(b.json).toBe(true);
  });

  it("resolves --deep / --no-deep tri-state (RULE-035)", () => {
    const on = Effect.runSync(
      resolveInspectFlags({ ...rawDefaults(), deep: Option.some(true) }),
    );
    expect(on.deep).toBe(true);
    const off = Effect.runSync(
      resolveInspectFlags({ ...rawDefaults(), deep: Option.some(false) }),
    );
    expect(off.deep).toBe(false);
  });

  it("--project splits + trims comma-separated paths; --diff sets the mode label", () => {
    const flags = Effect.runSync(
      resolveInspectFlags({
        ...rawDefaults(),
        project: Option.some(" a , b ,, c "),
        diff: true,
        diffBase: Option.some("main"),
      }),
    );
    expect(flags.projects).toEqual(["a", "b", "c"]);
    expect(flags.diff).toEqual({ base: "main" });
  });
});
