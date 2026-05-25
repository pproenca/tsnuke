/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-024).
 *
 * Goal: prove the Effect-TS `sanitizeConfig` is byte-for-byte equivalent to the
 * legacy implementation over a broad fixture set — SAME `{ config, warnings }`,
 * with warnings in the SAME ORDER (legacy field-traversal order is part of the
 * contract). Unlike the `score` slice there is NO deliberate deviation here:
 * `sanitizeConfig` is a faithful, behavior-preserving port (the only modernization
 * is the internal idiom — Schema decode-with-fallback — which is non-observable).
 *
 * Strategy:
 *   1. A VENDORED, FROZEN copy of legacy `sanitizeConfig` (+ its helpers
 *      `isObject`/`isStringArray`/`sanitizeSeverityMap`/`sanitizeIgnore`) from
 *      `legacy/tsnuke/packages/core/src/load-config.ts:22-154` is the oracle.
 *      Do NOT "improve" it — it exists to reproduce legacy behavior exactly.
 *   2. A broad, hand-authored fixture set covering: nullish/non-object raw, each
 *      field valid + invalid, the vocab quirk, plugins retained, overrides
 *      good/bad, multi-drop accumulation, and full round-trips.
 *   3. A generated/combinatorial fixture set: the cartesian product of a few
 *      valid/invalid values per field, exercising drop-set + warning-order
 *      interactions far beyond what hand fixtures reach.
 *   4. For every fixture: assert `modern` deep-equals `oracle` for BOTH `config`
 *      and `warnings` (order included).
 */

import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "../main/index.js";

// ===========================================================================
// ORACLE: frozen copy of legacy/tsnuke/packages/core/src/load-config.ts:22-154.
// Verbatim (only the `TsNukeConfig` type import is inlined as `any`-shaped
// locals so the oracle is self-contained). For differential testing ONLY.
// ===========================================================================

interface LegacyLoadConfigResult {
  config: LegacyConfig;
  warnings: string[];
}

interface LegacyConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
    tags?: string[];
    overrides?: { files: string[]; rules?: string[] }[];
  };
  failOn?: "error" | "warning" | "none";
  customRulesOnly?: boolean;
  plugins?: string[];
  rules?: Record<string, "error" | "warn" | "off">;
  categories?: Record<string, "error" | "warn" | "off">;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const SEVERITY_WORDS: ReadonlySet<string> = new Set(["error", "warn", "off"]);

function sanitizeSeverityMap(
  value: unknown,
  field: string,
  warnings: string[],
): Record<string, "error" | "warn" | "off"> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warnings.push(`Dropping "${field}": expected an object.`);
    return undefined;
  }
  const out: Record<string, "error" | "warn" | "off"> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string" && SEVERITY_WORDS.has(v)) {
      out[key] = v as "error" | "warn" | "off";
    } else {
      warnings.push(`Dropping "${field}.${key}": expected "error" | "warn" | "off".`);
    }
  }
  return out;
}

function sanitizeIgnore(
  value: unknown,
  warnings: string[],
): LegacyConfig["ignore"] | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warnings.push(`Dropping "ignore": expected an object.`);
    return undefined;
  }
  const out: NonNullable<LegacyConfig["ignore"]> = {};
  if (value["rules"] !== undefined) {
    if (isStringArray(value["rules"])) out.rules = value["rules"];
    else warnings.push(`Dropping "ignore.rules": expected string[].`);
  }
  if (value["files"] !== undefined) {
    if (isStringArray(value["files"])) out.files = value["files"];
    else warnings.push(`Dropping "ignore.files": expected string[].`);
  }
  if (value["tags"] !== undefined) {
    if (isStringArray(value["tags"])) out.tags = value["tags"];
    else warnings.push(`Dropping "ignore.tags": expected string[].`);
  }
  if (value["overrides"] !== undefined) {
    if (Array.isArray(value["overrides"])) {
      const overrides: NonNullable<NonNullable<LegacyConfig["ignore"]>["overrides"]> =
        [];
      for (const ov of value["overrides"]) {
        if (isObject(ov) && isStringArray(ov["files"])) {
          overrides.push({
            files: ov["files"],
            ...(isStringArray(ov["rules"]) ? { rules: ov["rules"] } : {}),
          });
        } else {
          warnings.push(
            `Dropping an "ignore.overrides" entry: expected { files: string[] }.`,
          );
        }
      }
      out.overrides = overrides;
    } else {
      warnings.push(`Dropping "ignore.overrides": expected an array.`);
    }
  }
  return out;
}

function legacySanitizeConfig(raw: unknown): LegacyLoadConfigResult {
  const warnings: string[] = [];
  if (!isObject(raw)) {
    if (raw !== undefined) {
      warnings.push("Ignoring config: expected a JSON object.");
    }
    return { config: {}, warnings };
  }

  const config: LegacyConfig = {};

  const ignore = sanitizeIgnore(raw["ignore"], warnings);
  if (ignore !== undefined) config.ignore = ignore;

  if (raw["failOn"] !== undefined) {
    if (
      raw["failOn"] === "error" ||
      raw["failOn"] === "warning" ||
      raw["failOn"] === "none"
    ) {
      config.failOn = raw["failOn"];
    } else {
      warnings.push(`Dropping "failOn": expected "error" | "warning" | "none".`);
    }
  }

  if (raw["customRulesOnly"] !== undefined) {
    if (typeof raw["customRulesOnly"] === "boolean") {
      config.customRulesOnly = raw["customRulesOnly"];
    } else {
      warnings.push(`Dropping "customRulesOnly": expected a boolean.`);
    }
  }

  if (raw["plugins"] !== undefined) {
    if (isStringArray(raw["plugins"])) {
      config.plugins = raw["plugins"];
    } else {
      warnings.push(`Dropping "plugins": expected string[].`);
    }
  }

  const rules = sanitizeSeverityMap(raw["rules"], "rules", warnings);
  if (rules !== undefined) config.rules = rules;

  const categories = sanitizeSeverityMap(raw["categories"], "categories", warnings);
  if (categories !== undefined) config.categories = categories;

  return { config, warnings };
}

// ===========================================================================
// FIXTURES
// ===========================================================================

// Hand-authored fixtures covering every documented behavior path.
const handFixtures: ReadonlyArray<unknown> = [
  // nullish / non-object raw
  undefined,
  null,
  42,
  0,
  "string",
  "",
  true,
  false,
  [],
  [1, 2, 3],
  ["a"],
  // empty / unknown keys
  {},
  { unknown: 1, another: "x" },
  // ignore
  { ignore: "x" },
  { ignore: 5 },
  { ignore: null },
  { ignore: [] },
  { ignore: {} },
  { ignore: { rules: ["a", "b"] } },
  { ignore: { rules: [1, 2] } },
  { ignore: { rules: "x" } },
  { ignore: { files: ["f"] } },
  { ignore: { files: 7 } },
  { ignore: { tags: ["t"] } },
  { ignore: { tags: [true] } },
  { ignore: { rules: ["r"], files: ["f"], tags: ["t"] } },
  // overrides
  { ignore: { overrides: "x" } },
  { ignore: { overrides: 9 } },
  { ignore: { overrides: [] } },
  { ignore: { overrides: [{ files: ["a"] }] } },
  { ignore: { overrides: [{ files: ["a"], rules: ["r"] }] } },
  { ignore: { overrides: [{ files: ["a"], rules: "r" }] } },
  { ignore: { overrides: [{ rules: ["r"] }] } },
  { ignore: { overrides: [{ files: [1] }] } },
  { ignore: { overrides: ["garbage"] } },
  { ignore: { overrides: [null] } },
  {
    ignore: {
      overrides: [{ files: ["a"] }, { rules: ["x"] }, { files: ["b"], rules: ["r"] }, "x"],
    },
  },
  // failOn — vocab quirk
  { failOn: "error" },
  { failOn: "warning" },
  { failOn: "none" },
  { failOn: "warn" }, // INVALID in failOn
  { failOn: "off" },
  { failOn: "always" },
  { failOn: 1 },
  { failOn: null },
  { failOn: true },
  // customRulesOnly
  { customRulesOnly: true },
  { customRulesOnly: false },
  { customRulesOnly: "yes" },
  { customRulesOnly: 1 },
  { customRulesOnly: null },
  // plugins (retained, never loaded)
  { plugins: [] },
  { plugins: ["./a.js", "pkg"] },
  { plugins: [1, 2] },
  { plugins: "evil" },
  { plugins: {} },
  // rules / categories — vocab quirk
  { rules: { a: "error", b: "warn", c: "off" } },
  { rules: { a: "warning" } }, // INVALID in rules
  { rules: { a: "loud", b: 3, c: "error" } },
  { rules: "x" },
  { rules: [] },
  { rules: {} },
  { rules: null },
  { categories: { security: "error" } },
  { categories: { security: "warn" } },
  { categories: { security: "warning" } }, // INVALID
  { categories: { security: "loud" } },
  { categories: 5 },
  { categories: {} },
  // accumulation — many drops at once
  {
    ignore: "x",
    failOn: "bogus",
    customRulesOnly: "x",
    plugins: 1,
    rules: "x",
    categories: "x",
  },
  // accumulation — reversed insertion order (warning order must NOT follow it)
  {
    categories: "x",
    rules: "x",
    plugins: 1,
    customRulesOnly: "x",
    failOn: "bogus",
    ignore: "x",
  },
  // full valid round-trip
  {
    ignore: {
      rules: ["no-any", "no-var"],
      files: ["dist/**"],
      tags: ["legacy"],
      overrides: [{ files: ["legacy/**"] }, { files: ["scripts/**"], rules: ["no-console"] }],
    },
    failOn: "warning",
    customRulesOnly: true,
    plugins: ["./local-plugin.js"],
    rules: { "no-any": "error", "no-var": "warn", "no-debugger": "off" },
    categories: { security: "error", style: "off" },
  },
  // mixed valid + invalid within several fields simultaneously
  {
    ignore: { rules: ["r"], files: 7, overrides: [{ files: ["a"] }, "bad"] },
    failOn: "warning",
    customRulesOnly: "nope",
    plugins: ["p"],
    rules: { good: "warn", bad: "warning" },
    categories: { ok: "off", nope: 1 },
  },
];

// Combinatorial fixtures: a small cartesian product over per-field value choices,
// generating drop-set / warning-order interactions beyond the hand set.
function buildCombinatorialFixtures(): unknown[] {
  const fieldChoices: Record<string, unknown[]> = {
    ignore: [undefined, "x", {}, { rules: ["r"] }, { rules: 1 }],
    failOn: [undefined, "warning", "warn", "bad"],
    customRulesOnly: [undefined, true, "x"],
    plugins: [undefined, ["p"], 1],
    rules: [undefined, { r: "warn" }, { r: "warning" }, "x"],
    categories: [undefined, { c: "error" }, { c: "bad" }],
  };
  // Full cartesian product would be 5*4*3*3*4*3 = 2160 — keep all of them.
  const out: unknown[] = [];
  for (const ignore of fieldChoices["ignore"]!)
    for (const failOn of fieldChoices["failOn"]!)
      for (const customRulesOnly of fieldChoices["customRulesOnly"]!)
        for (const plugins of fieldChoices["plugins"]!)
          for (const rules of fieldChoices["rules"]!)
            for (const categories of fieldChoices["categories"]!) {
              const obj: Record<string, unknown> = {};
              // Only set a key when its choice is defined, so we exercise the
              // "field absent entirely" path too (legacy keys off `!== undefined`).
              if (ignore !== undefined) obj["ignore"] = ignore;
              if (failOn !== undefined) obj["failOn"] = failOn;
              if (customRulesOnly !== undefined) obj["customRulesOnly"] = customRulesOnly;
              if (plugins !== undefined) obj["plugins"] = plugins;
              if (rules !== undefined) obj["rules"] = rules;
              if (categories !== undefined) obj["categories"] = categories;
              out.push(obj);
            }
  return out;
}

const combinatorialFixtures = buildCombinatorialFixtures();

// ===========================================================================
// THE PROOF
// ===========================================================================

describe("equivalence — RULE-024: modern == legacy oracle (hand fixtures)", () => {
  it.each(handFixtures.map((f, i) => [i, f] as const))(
    "fixture #%i deep-equals legacy { config, warnings }",
    (_i, fixture) => {
      const modern = sanitizeConfig(fixture);
      const oracle = legacySanitizeConfig(fixture);
      expect(modern.config).toStrictEqual(oracle.config);
      expect(modern.warnings).toStrictEqual(oracle.warnings); // ORDER included
    },
  );
});

describe("equivalence — RULE-024: modern == legacy oracle (combinatorial)", () => {
  it("every cartesian-product fixture deep-equals the legacy oracle (config + warning order)", () => {
    expect(combinatorialFixtures.length).toBe(5 * 4 * 3 * 3 * 4 * 3); // 2160

    let compared = 0;
    let divergences = 0;
    for (const fixture of combinatorialFixtures) {
      const modern = sanitizeConfig(fixture);
      const oracle = legacySanitizeConfig(fixture);

      if (
        JSON.stringify(modern.config) !== JSON.stringify(oracle.config) ||
        JSON.stringify(modern.warnings) !== JSON.stringify(oracle.warnings)
      ) {
        divergences++;
        // Surface the first divergence with full detail.
        expect(modern.config, `config mismatch for ${JSON.stringify(fixture)}`).toStrictEqual(
          oracle.config,
        );
        expect(
          modern.warnings,
          `warnings mismatch for ${JSON.stringify(fixture)}`,
        ).toStrictEqual(oracle.warnings);
      }
      compared++;
    }

    expect(compared).toBe(2160);
    expect(divergences).toBe(0); // faithful port — NO deviation (unlike the score slice)
  });
});

describe("equivalence — RULE-024: harness sanity (the oracle actually exercises drops)", () => {
  it("the fixture set produces both warnings and clean configs (not vacuously equal)", () => {
    const anyWarn = handFixtures.some((f) => legacySanitizeConfig(f).warnings.length > 0);
    const anyClean = handFixtures.some((f) => legacySanitizeConfig(f).warnings.length === 0);
    expect(anyWarn).toBe(true);
    expect(anyClean).toBe(true);
  });
});

describe("equivalence — RULE-024 / D-sparse: sparse arrays are the ONE deliberate divergence", () => {
  // Legacy `isStringArray` uses `Array.prototype.every`, which SKIPS holes, so a sparse
  // array (`["a", <hole>]`) is accepted verbatim — keeping an array with an `undefined`
  // hole as if it were `string[]`. The modern `asStringArray` decodes via
  // `Schema.Array(Schema.String)`, which REJECTS the hole and drops the field with a
  // warning. This is the ONLY input class where modern ≠ legacy; it is a deliberate
  // HARDENING (a holed array is not a valid `string[]`). `JSON.parse` never yields holes,
  // so the real (deferred FS) path is unaffected. Pinned here so the differential's
  // "byte-for-byte / divergences === 0" claim is honest about its one documented exception
  // (architecture review). NOT added to the differences===0 grid because modern ≠ legacy.
  it("a sparse `ignore.rules`: modern drops+warns (hardening); legacy keeps the hole", () => {
    const sparse: unknown[] = ["a", "b"];
    delete sparse[0]; // a genuine hole → [ <hole>, "b" ]
    const raw = { ignore: { rules: sparse } };

    const modern = sanitizeConfig(raw);
    const legacy = legacySanitizeConfig(raw);

    // modern: the hole fails Schema.Array(String) → field dropped + warned
    expect(modern.config.ignore).toStrictEqual({});
    expect(modern.warnings).toContain('Dropping "ignore.rules": expected string[].');
    // legacy: every() skips the hole → kept verbatim, no warning
    expect(legacy.config.ignore?.rules).toBeDefined();
    expect(legacy.warnings).toHaveLength(0);
    // → the one documented divergence
    expect(modern.config).not.toStrictEqual(legacy.config);
  });
});
