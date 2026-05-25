/**
 * Characterization tests for `sanitizeConfig` — RULE-024 (lenient config
 * validation, drop-not-throw) + RULE-040 (severity vocabulary).
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/sanitize.js` is written AFTER these tests and must make them pass.
 *
 * THE CONTRACT (RULE-024): `sanitizeConfig(raw)` NEVER throws. A non-object raw is
 * ignored (with a warning unless `raw === undefined`); every malformed field is
 * DROPPED with a verbatim warning, and the rest is honored. The warning MESSAGES
 * are part of the observable contract and are asserted verbatim throughout. A
 * config key is set ONLY when its sanitized value is defined
 * (`exactOptionalPropertyTypes`-friendly — `toStrictEqual` would fail on a spurious
 * `key: undefined`).
 *
 * VOCAB QUIRK (RULE-040): `failOn` uses `"warning"` (engine vocab) while
 * `rules`/`categories` use `"warn"` (config vocab). `sanitizeConfig` keeps the
 * config vocab VERBATIM (no `warn`→`warning` normalization — that happens
 * downstream). See `vocabularyQuirk.test.ts` for the dedicated coverage.
 */

import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "../main/index.js";

describe("sanitizeConfig — RULE-024 (non-object / nullish raw)", () => {
  it("undefined raw -> empty config, NO warning (silent)", () => {
    expect(sanitizeConfig(undefined)).toStrictEqual({ config: {}, warnings: [] });
  });

  it("null raw -> empty config + warning", () => {
    expect(sanitizeConfig(null)).toStrictEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });

  it("array raw -> empty config + warning (arrays are not config objects)", () => {
    expect(sanitizeConfig([1, 2, 3])).toStrictEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });

  it("string raw -> empty config + warning", () => {
    expect(sanitizeConfig("nope")).toStrictEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });

  it("number raw -> empty config + warning", () => {
    expect(sanitizeConfig(42)).toStrictEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });

  it("boolean raw -> empty config + warning", () => {
    expect(sanitizeConfig(true)).toStrictEqual({
      config: {},
      warnings: ["Ignoring config: expected a JSON object."],
    });
  });

  it("NEVER throws on garbage input (returns a value)", () => {
    expect(() => sanitizeConfig(Symbol("x") as unknown)).not.toThrow();
  });
});

describe("sanitizeConfig — RULE-024 (empty / minimal)", () => {
  it("empty object -> empty config, no warnings", () => {
    expect(sanitizeConfig({})).toStrictEqual({ config: {}, warnings: [] });
  });

  it("unknown keys are silently ignored (not warned, not retained)", () => {
    expect(sanitizeConfig({ totallyUnknown: 7, anotherOne: "x" })).toStrictEqual({
      config: {},
      warnings: [],
    });
  });
});

// ---------------------------------------------------------------------------
// ignore
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024 (ignore)", () => {
  it("ignore is not an object -> dropped with warning", () => {
    expect(sanitizeConfig({ ignore: "x" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "ignore": expected an object.'],
    });
  });

  it("ignore is an array -> dropped with warning (arrays are not objects here)", () => {
    expect(sanitizeConfig({ ignore: ["a"] })).toStrictEqual({
      config: {},
      warnings: ['Dropping "ignore": expected an object.'],
    });
  });

  it("empty ignore object -> ignore: {} retained, no warnings", () => {
    expect(sanitizeConfig({ ignore: {} })).toStrictEqual({
      config: { ignore: {} },
      warnings: [],
    });
  });

  it("ignore.rules valid string[] -> retained", () => {
    expect(sanitizeConfig({ ignore: { rules: ["no-any"] } })).toStrictEqual({
      config: { ignore: { rules: ["no-any"] } },
      warnings: [],
    });
  });

  it("ignore.rules not a string[] -> dropped with warning", () => {
    expect(sanitizeConfig({ ignore: { rules: [1, 2] } })).toStrictEqual({
      config: { ignore: {} },
      warnings: ['Dropping "ignore.rules": expected string[].'],
    });
  });

  it("ignore.files not a string[] -> dropped with warning", () => {
    expect(sanitizeConfig({ ignore: { files: "x" } })).toStrictEqual({
      config: { ignore: {} },
      warnings: ['Dropping "ignore.files": expected string[].'],
    });
  });

  it("ignore.tags not a string[] -> dropped with warning", () => {
    expect(sanitizeConfig({ ignore: { tags: [true] } })).toStrictEqual({
      config: { ignore: {} },
      warnings: ['Dropping "ignore.tags": expected string[].'],
    });
  });

  it("ignore.rules/files/tags all valid -> all retained", () => {
    expect(
      sanitizeConfig({
        ignore: { rules: ["r1"], files: ["f1"], tags: ["t1"] },
      }),
    ).toStrictEqual({
      config: { ignore: { rules: ["r1"], files: ["f1"], tags: ["t1"] } },
      warnings: [],
    });
  });
});

// ---------------------------------------------------------------------------
// ignore.overrides
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024 (ignore.overrides)", () => {
  it("overrides not an array -> dropped with warning", () => {
    expect(sanitizeConfig({ ignore: { overrides: "x" } })).toStrictEqual({
      config: { ignore: {} },
      warnings: ['Dropping "ignore.overrides": expected an array.'],
    });
  });

  it("override with files only (no rules) -> retained without a rules key", () => {
    expect(
      sanitizeConfig({ ignore: { overrides: [{ files: ["a.ts"] }] } }),
    ).toStrictEqual({
      config: { ignore: { overrides: [{ files: ["a.ts"] }] } },
      warnings: [],
    });
  });

  it("override with files + valid rules -> both retained", () => {
    expect(
      sanitizeConfig({
        ignore: { overrides: [{ files: ["a.ts"], rules: ["no-any"] }] },
      }),
    ).toStrictEqual({
      config: { ignore: { overrides: [{ files: ["a.ts"], rules: ["no-any"] }] } },
      warnings: [],
    });
  });

  it("override with files + INVALID rules -> files kept, rules silently omitted (legacy)", () => {
    // legacy keeps the entry (files valid) and just drops the bad rules with NO warning.
    expect(
      sanitizeConfig({
        ignore: { overrides: [{ files: ["a.ts"], rules: "no-any" }] },
      }),
    ).toStrictEqual({
      config: { ignore: { overrides: [{ files: ["a.ts"] }] } },
      warnings: [],
    });
  });

  it("override lacking files: string[] -> entry dropped with warning", () => {
    expect(
      sanitizeConfig({ ignore: { overrides: [{ rules: ["no-any"] }] } }),
    ).toStrictEqual({
      config: { ignore: { overrides: [] } },
      warnings: ['Dropping an "ignore.overrides" entry: expected { files: string[] }.'],
    });
  });

  it("override that is not an object -> entry dropped with warning", () => {
    expect(sanitizeConfig({ ignore: { overrides: ["nope"] } })).toStrictEqual({
      config: { ignore: { overrides: [] } },
      warnings: ['Dropping an "ignore.overrides" entry: expected { files: string[] }.'],
    });
  });

  it("override with non-string files entries -> dropped with warning", () => {
    expect(
      sanitizeConfig({ ignore: { overrides: [{ files: [1, 2] }] } }),
    ).toStrictEqual({
      config: { ignore: { overrides: [] } },
      warnings: ['Dropping an "ignore.overrides" entry: expected { files: string[] }.'],
    });
  });

  it("mixed good/bad overrides -> good kept, bad dropped (warning per bad entry, in order)", () => {
    expect(
      sanitizeConfig({
        ignore: {
          overrides: [
            { files: ["ok.ts"] },
            { rules: ["x"] }, // bad: no files
            { files: ["ok2.ts"], rules: ["r"] },
            "garbage", // bad: not an object
          ],
        },
      }),
    ).toStrictEqual({
      config: {
        ignore: {
          overrides: [{ files: ["ok.ts"] }, { files: ["ok2.ts"], rules: ["r"] }],
        },
      },
      warnings: [
        'Dropping an "ignore.overrides" entry: expected { files: string[] }.',
        'Dropping an "ignore.overrides" entry: expected { files: string[] }.',
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// failOn
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024/040 (failOn)", () => {
  it.each(["error", "warning", "none"] as const)(
    "failOn %s -> retained verbatim",
    (v) => {
      expect(sanitizeConfig({ failOn: v })).toStrictEqual({
        config: { failOn: v },
        warnings: [],
      });
    },
  );

  it('failOn "warn" is INVALID (failOn uses engine vocab "warning") -> dropped', () => {
    expect(sanitizeConfig({ failOn: "warn" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "failOn": expected "error" | "warning" | "none".'],
    });
  });

  it("failOn bogus string -> dropped with warning", () => {
    expect(sanitizeConfig({ failOn: "always" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "failOn": expected "error" | "warning" | "none".'],
    });
  });

  it("failOn non-string -> dropped with warning", () => {
    expect(sanitizeConfig({ failOn: 1 })).toStrictEqual({
      config: {},
      warnings: ['Dropping "failOn": expected "error" | "warning" | "none".'],
    });
  });
});

// ---------------------------------------------------------------------------
// customRulesOnly
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024 (customRulesOnly)", () => {
  it.each([true, false])("customRulesOnly %s -> retained", (v) => {
    expect(sanitizeConfig({ customRulesOnly: v })).toStrictEqual({
      config: { customRulesOnly: v },
      warnings: [],
    });
  });

  it("customRulesOnly non-boolean -> dropped with warning", () => {
    expect(sanitizeConfig({ customRulesOnly: "yes" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "customRulesOnly": expected a boolean.'],
    });
  });
});

// ---------------------------------------------------------------------------
// plugins (RULE-039: retained-not-loaded)
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024/039 (plugins retained, never loaded)", () => {
  it("valid plugins string[] -> RETAINED on the config (so it can be warned about later)", () => {
    expect(sanitizeConfig({ plugins: ["./evil.js", "pkg"] })).toStrictEqual({
      config: { plugins: ["./evil.js", "pkg"] },
      warnings: [],
    });
  });

  it("empty plugins array -> retained as []", () => {
    expect(sanitizeConfig({ plugins: [] })).toStrictEqual({
      config: { plugins: [] },
      warnings: [],
    });
  });

  it("plugins not a string[] -> dropped with warning", () => {
    expect(sanitizeConfig({ plugins: [1, 2] })).toStrictEqual({
      config: {},
      warnings: ['Dropping "plugins": expected string[].'],
    });
  });

  it("plugins not an array -> dropped with warning", () => {
    expect(sanitizeConfig({ plugins: "evil" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "plugins": expected string[].'],
    });
  });
});

// ---------------------------------------------------------------------------
// rules / categories (severity maps — config vocab error|warn|off)
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024/040 (rules severity map)", () => {
  it.each(["error", "warn", "off"] as const)(
    "rules entry value %s -> retained verbatim (config vocab kept, NOT normalized)",
    (v) => {
      expect(sanitizeConfig({ rules: { "no-any": v } })).toStrictEqual({
        config: { rules: { "no-any": v } },
        warnings: [],
      });
    },
  );

  it("rules is not an object -> dropped with warning", () => {
    expect(sanitizeConfig({ rules: "x" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "rules": expected an object.'],
    });
  });

  it("rules is an array -> dropped with warning", () => {
    expect(sanitizeConfig({ rules: ["error"] })).toStrictEqual({
      config: {},
      warnings: ['Dropping "rules": expected an object.'],
    });
  });

  it('rules entry with "warning" is INVALID (rules use config vocab "warn") -> that key dropped', () => {
    expect(sanitizeConfig({ rules: { "no-any": "warning" } })).toStrictEqual({
      config: { rules: {} },
      warnings: ['Dropping "rules.no-any": expected "error" | "warn" | "off".'],
    });
  });

  it("rules entry with a non-severity value -> that key dropped with warning", () => {
    expect(sanitizeConfig({ rules: { "no-any": "loud" } })).toStrictEqual({
      config: { rules: {} },
      warnings: ['Dropping "rules.no-any": expected "error" | "warn" | "off".'],
    });
  });

  it("rules entry with a non-string value -> that key dropped with warning", () => {
    expect(sanitizeConfig({ rules: { "no-any": 3 } })).toStrictEqual({
      config: { rules: {} },
      warnings: ['Dropping "rules.no-any": expected "error" | "warn" | "off".'],
    });
  });

  it("rules with a mix of valid and invalid -> valid kept, invalid dropped per-key (order preserved)", () => {
    expect(
      sanitizeConfig({
        rules: { "no-any": "error", "bad-1": "nope", "no-var": "off", "bad-2": 9 },
      }),
    ).toStrictEqual({
      config: { rules: { "no-any": "error", "no-var": "off" } },
      warnings: [
        'Dropping "rules.bad-1": expected "error" | "warn" | "off".',
        'Dropping "rules.bad-2": expected "error" | "warn" | "off".',
      ],
    });
  });
});

describe("sanitizeConfig — RULE-024/040 (categories severity map)", () => {
  it("categories valid -> retained verbatim", () => {
    expect(sanitizeConfig({ categories: { security: "error" } })).toStrictEqual({
      config: { categories: { security: "error" } },
      warnings: [],
    });
  });

  it("categories not an object -> dropped with warning", () => {
    expect(sanitizeConfig({ categories: 5 })).toStrictEqual({
      config: {},
      warnings: ['Dropping "categories": expected an object.'],
    });
  });

  it("categories bad entry -> that key dropped with warning (categories.<key> message)", () => {
    expect(sanitizeConfig({ categories: { security: "loud" } })).toStrictEqual({
      config: { categories: {} },
      warnings: ['Dropping "categories.security": expected "error" | "warn" | "off".'],
    });
  });
});

// ---------------------------------------------------------------------------
// accumulation + full round-trip
// ---------------------------------------------------------------------------
describe("sanitizeConfig — RULE-024 (multiple simultaneous drops accumulate)", () => {
  it("every field invalid at once -> all warnings accumulate in legacy field order", () => {
    const result = sanitizeConfig({
      ignore: "x",
      failOn: "bogus",
      customRulesOnly: "x",
      plugins: 1,
      rules: "x",
      categories: "x",
    });
    expect(result.config).toStrictEqual({});
    expect(result.warnings).toStrictEqual([
      'Dropping "ignore": expected an object.',
      'Dropping "failOn": expected "error" | "warning" | "none".',
      'Dropping "customRulesOnly": expected a boolean.',
      'Dropping "plugins": expected string[].',
      'Dropping "rules": expected an object.',
      'Dropping "categories": expected an object.',
    ]);
  });

  it("warning ORDER follows legacy field traversal: ignore, failOn, customRulesOnly, plugins, rules, categories", () => {
    const result = sanitizeConfig({
      categories: "x", // declared last in object literal, but emitted last regardless
      rules: "x",
      plugins: 1,
      customRulesOnly: "x",
      failOn: "bogus",
      ignore: "x",
    });
    // Object key insertion order is reversed vs the previous test, yet the warning
    // order must still be the fixed legacy field order (not the input key order).
    expect(result.warnings).toStrictEqual([
      'Dropping "ignore": expected an object.',
      'Dropping "failOn": expected "error" | "warning" | "none".',
      'Dropping "customRulesOnly": expected a boolean.',
      'Dropping "plugins": expected string[].',
      'Dropping "rules": expected an object.',
      'Dropping "categories": expected an object.',
    ]);
  });
});

describe("sanitizeConfig — RULE-024 (fully-valid config round-trips)", () => {
  it("a complete, valid config is preserved exactly with no warnings", () => {
    const raw = {
      ignore: {
        rules: ["no-any", "no-var"],
        files: ["dist/**"],
        tags: ["legacy"],
        overrides: [
          { files: ["legacy/**"] },
          { files: ["scripts/**"], rules: ["no-console"] },
        ],
      },
      failOn: "warning",
      customRulesOnly: true,
      plugins: ["./local-plugin.js"],
      rules: { "no-any": "error", "no-var": "warn", "no-debugger": "off" },
      categories: { security: "error", style: "off" },
    };
    expect(sanitizeConfig(raw)).toStrictEqual({ config: raw, warnings: [] });
  });

  it("does not mutate or alias the input (returns fresh structures)", () => {
    const raw = { ignore: { rules: ["a"] }, plugins: ["p"] };
    const result = sanitizeConfig(raw);
    expect(result.config.ignore).not.toBe(raw.ignore);
    expect(result.config.plugins).not.toBe(raw.plugins);
  });
});
