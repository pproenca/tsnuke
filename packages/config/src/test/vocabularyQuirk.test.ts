/**
 * The `warn` ↔ `warning` vocabulary quirk — RULE-040 (config severity vocabulary).
 *
 * ts-doctor speaks TWO severity vocabularies in the config contract, and
 * `sanitizeConfig` MUST preserve both verbatim:
 *
 *   - `failOn`            uses the ENGINE vocab:  "error" | "warning" | "none"
 *   - `rules`/`categories` use the CONFIG vocab:  "error" | "warn"    | "off"
 *
 * So `"warn"` is valid in `rules`/`categories` but INVALID in `failOn`, and
 * `"warning"` is valid in `failOn` but INVALID in `rules`/`categories`. Crucially,
 * `sanitizeConfig` does NOT normalize `"warn"` → `"warning"` — that happens
 * downstream (legacy `index.ts`/`filter-pipeline.ts`; the filter-pipeline Effect
 * slice's `normalizeConfigSeverity`). This file pins the quirk in isolation because
 * it is the single most error-prone part of the contract (RULE-040's flagged
 * "vocabulary trap").
 */

import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "../main/index.js";

describe("vocab quirk — RULE-040 (failOn = engine vocab, rules/categories = config vocab)", () => {
  it('failOn accepts "warning" and REJECTS "warn"', () => {
    expect(sanitizeConfig({ failOn: "warning" })).toStrictEqual({
      config: { failOn: "warning" },
      warnings: [],
    });
    expect(sanitizeConfig({ failOn: "warn" })).toStrictEqual({
      config: {},
      warnings: ['Dropping "failOn": expected "error" | "warning" | "none".'],
    });
  });

  it('rules accepts "warn" and REJECTS "warning"', () => {
    expect(sanitizeConfig({ rules: { r: "warn" } })).toStrictEqual({
      config: { rules: { r: "warn" } },
      warnings: [],
    });
    expect(sanitizeConfig({ rules: { r: "warning" } })).toStrictEqual({
      config: { rules: {} },
      warnings: ['Dropping "rules.r": expected "error" | "warn" | "off".'],
    });
  });

  it('categories accepts "warn" and REJECTS "warning"', () => {
    expect(sanitizeConfig({ categories: { c: "warn" } })).toStrictEqual({
      config: { categories: { c: "warn" } },
      warnings: [],
    });
    expect(sanitizeConfig({ categories: { c: "warning" } })).toStrictEqual({
      config: { categories: {} },
      warnings: ['Dropping "categories.c": expected "error" | "warn" | "off".'],
    });
  });

  it('"warn" is kept VERBATIM in rules — no normalization to "warning" happens here', () => {
    const result = sanitizeConfig({ rules: { "no-any": "warn" } });
    // Pin that the stored value is literally "warn", not the engine "warning".
    expect(result.config.rules?.["no-any"]).toBe("warn");
  });

  it("both vocabularies coexist in one config, each kept verbatim", () => {
    expect(
      sanitizeConfig({
        failOn: "warning",
        rules: { "no-any": "warn" },
        categories: { security: "warn" },
      }),
    ).toStrictEqual({
      config: {
        failOn: "warning",
        rules: { "no-any": "warn" },
        categories: { security: "warn" },
      },
      warnings: [],
    });
  });
});
