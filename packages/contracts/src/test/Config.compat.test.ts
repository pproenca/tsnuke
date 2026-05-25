/**
 * COMPATIBILITY / SUPERSET PROOF — canonical `TsFixConfig` family vs the legacy
 * type AND all three vendored copies (RULE-024 / RULE-040).
 *
 * Three slices vendor a config contract today:
 *   - config slice:          the FULL TsFixConfig (all 6 fields) — already canonical.
 *   - filter-pipeline slice:  a 3-field SUBSET (ignore/rules/categories), and its
 *                             IgnoreConfig omits `tags`.
 *   - security slice:         the BARE `{ plugins?: readonly string[] }` (one field).
 *
 * The canonical TsFixConfig here is the FULL legacy contract (`core/types.ts:151-164`).
 * These tests PIN that it accepts every shape all three vendored copies produce — so
 * filter-pipeline and security can de-vendor onto it — and rejects out-of-contract values.
 *
 * VOCABULARY QUIRK preserved exactly (RULE-040): `failOn` uses the ENGINE vocabulary
 * `"error" | "warning" | "none"`, while `rules`/`categories` use the CONFIG vocabulary
 * `"error" | "warn" | "off"`. The `"warn"` vs `"warning"` split is an observable part
 * of the contract and is asserted here, NOT unified.
 */

import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ConfigSeverity,
  FailOn,
  IgnoreConfig,
  IgnoreOverride,
  TsFixConfig,
} from "../main/index.js";

const decode = <A, I>(s: Schema.Schema<A, I>) => Schema.decodeUnknownEither(s);
const accepts = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isRight(decode(s)(v));
const rejects = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isLeft(decode(s)(v));

describe("ConfigSeverity vs FailOn — the preserved warn/warning vocabulary quirk (RULE-040)", () => {
  it("ConfigSeverity (config file vocab) accepts error/warn/off, rejects warning", () => {
    expect(accepts(ConfigSeverity, "error")).toBe(true);
    expect(accepts(ConfigSeverity, "warn")).toBe(true);
    expect(accepts(ConfigSeverity, "off")).toBe(true);
    // The engine spelling "warning" is NOT config-file vocab — must be rejected.
    expect(rejects(ConfigSeverity, "warning")).toBe(true);
  });

  it("FailOn (engine vocab) accepts error/warning/none, rejects warn/off", () => {
    expect(accepts(FailOn, "error")).toBe(true);
    expect(accepts(FailOn, "warning")).toBe(true);
    expect(accepts(FailOn, "none")).toBe(true);
    // The config spelling "warn" is NOT failOn vocab; "off" is not either.
    expect(rejects(FailOn, "warn")).toBe(true);
    expect(rejects(FailOn, "off")).toBe(true);
  });
});

describe("IgnoreOverride / IgnoreConfig — canonical superset of both vendored copies", () => {
  it("IgnoreOverride requires `files`, allows optional `rules`", () => {
    expect(accepts(IgnoreOverride, { files: ["a.ts"] })).toBe(true);
    expect(accepts(IgnoreOverride, { files: ["a.ts"], rules: ["no-ts-ignore"] })).toBe(true);
    expect(rejects(IgnoreOverride, { rules: ["no-ts-ignore"] })).toBe(true); // missing files
  });

  it("canonical IgnoreConfig carries `tags` (full config) AND accepts filter-pipeline's subset (no tags)", () => {
    // config slice's full IgnoreConfig has tags; filter-pipeline's omits it. The canonical
    // (full) must accept BOTH — tags present and tags absent.
    expect(
      accepts(IgnoreConfig, {
        rules: ["no-ts-ignore"],
        files: ["dist/**"],
        tags: ["generated"],
        overrides: [{ files: ["legacy/**"] }],
      }),
    ).toBe(true);
    // filter-pipeline's shape (no `tags`).
    expect(
      accepts(IgnoreConfig, {
        rules: ["no-ts-ignore"],
        files: ["dist/**"],
        overrides: [{ files: ["legacy/**"], rules: ["no-cycles"] }],
      }),
    ).toBe(true);
    // empty ignore is valid.
    expect(accepts(IgnoreConfig, {})).toBe(true);
  });
});

describe("TsFixConfig — canonical FULL config is a SUPERSET of legacy + all 3 vendored copies", () => {
  it("accepts the empty `{}` config (the no-op identity all copies accept)", () => {
    expect(accepts(TsFixConfig, {})).toBe(true);
  });

  it("accepts the FULL legacy shape (all 6 fields present)", () => {
    expect(
      accepts(TsFixConfig, {
        ignore: {
          rules: ["no-ts-ignore"],
          files: ["dist/**"],
          tags: ["generated"],
          overrides: [{ files: ["legacy/**"], rules: ["no-cycles"] }],
        },
        failOn: "warning",
        customRulesOnly: false,
        plugins: ["@scope/plugin"],
        rules: { "no-ts-ignore": "error", "no-explicit-any": "warn", "no-cycles": "off" },
        categories: { suppression: "error", types: "warn" },
      }),
    ).toBe(true);
  });

  it("accepts the filter-pipeline SUBSET shape (only ignore/rules/categories) — de-vendor proof", () => {
    // filter-pipeline's vendored TsFixConfig has exactly these 3 fields; prove the
    // narrower shape is valid under the full canonical config.
    expect(
      accepts(TsFixConfig, {
        ignore: { rules: ["no-ts-ignore"], files: ["dist/**"] },
        rules: { "no-ts-ignore": "off" },
        categories: { types: "warn" },
      }),
    ).toBe(true);
  });

  it("accepts the security SUBSET shape (only `{ plugins }`) — de-vendor proof", () => {
    // security's vendored TsFixConfig is `{ plugins?: readonly string[] }`.
    expect(accepts(TsFixConfig, { plugins: ["@scope/plugin", "./local-plugin.js"] })).toBe(true);
    expect(accepts(TsFixConfig, { plugins: [] })).toBe(true);
    expect(accepts(TsFixConfig, {})).toBe(true); // plugins omitted
  });

  it("rejects out-of-contract values", () => {
    // rules/categories use CONFIG vocab — "warning" (engine spelling) is invalid there.
    expect(rejects(TsFixConfig, { rules: { r: "warning" } })).toBe(true);
    // failOn uses ENGINE vocab — "warn" (config spelling) is invalid there.
    expect(rejects(TsFixConfig, { failOn: "warn" })).toBe(true);
    // plugins must be strings.
    expect(rejects(TsFixConfig, { plugins: [1, 2] })).toBe(true);
    // customRulesOnly must be boolean.
    expect(rejects(TsFixConfig, { customRulesOnly: "yes" })).toBe(true);
    // ignore.overrides entry must carry files.
    expect(rejects(TsFixConfig, { ignore: { overrides: [{ rules: ["r"] }] } })).toBe(true);
  });
});

describe("TsFixConfig — round-trip decode(encode(x)) === x", () => {
  it("round-trips a representative full config", () => {
    const value: typeof TsFixConfig.Type = {
      ignore: {
        rules: ["no-ts-ignore"],
        files: ["dist/**"],
        tags: ["generated"],
        overrides: [{ files: ["legacy/**"], rules: ["no-cycles"] }],
      },
      failOn: "error",
      customRulesOnly: true,
      plugins: ["@scope/plugin"],
      rules: { "no-ts-ignore": "error", "no-explicit-any": "warn" },
      categories: { types: "off" },
    };
    const decoded = Schema.decodeSync(TsFixConfig)(Schema.encodeSync(TsFixConfig)(value));
    expect(decoded).toStrictEqual(value);
  });

  it("round-trips the empty config", () => {
    const value: typeof TsFixConfig.Type = {};
    expect(
      Schema.decodeSync(TsFixConfig)(Schema.encodeSync(TsFixConfig)(value)),
    ).toStrictEqual(value);
  });
});
