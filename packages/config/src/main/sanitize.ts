/**
 * The PURE core of ts-fix's config loader — `sanitizeConfig` (RULE-024:
 * lenient config validation, drop-not-throw). Source of truth (READ-ONLY):
 * `legacy/ts-fix/packages/core/src/load-config.ts:22-154`.
 *
 * CONTRACT (RULE-024): `sanitizeConfig(raw: unknown)` NEVER throws. A non-object
 * raw is ignored (with a warning unless `raw === undefined`); every malformed
 * field is DROPPED, the rest honored. The warning MESSAGES and their ORDER (legacy
 * field-traversal order: ignore → failOn → customRulesOnly → plugins → rules →
 * categories) are an observable part of the contract and are preserved verbatim.
 *
 * EFFECT IDIOM (Modernization Brief): the leaf validations are `effect/Schema`
 * decode-with-fallback — each candidate value is run through
 * `Schema.decodeUnknownEither(<schema>)`; `Either.isRight` means "valid, keep it",
 * `Either.isLeft` means "invalid, drop it and push the legacy warning". This is the
 * decode-with-fallback pattern the brief asks for (Schema models the contract,
 * RULE-040), wrapped so the per-field drop semantics + verbatim messages — the
 * actual contract — are reproduced exactly. `sanitizeConfig` itself is a PURE
 * synchronous function (NOT `Effect<...>`-wrapped); the Effect ecosystem appears in
 * the contract (Schema, `TsFixConfig`) and the decode helpers, matching the
 * established pure-slice pattern (cf. the `score`/`filter-pipeline` slices).
 *
 * NOTE on field order: `Schema.Struct` decode of the WHOLE config would not give us
 * legacy's per-field drop-with-warning semantics (Schema fails the whole struct, or
 * needs message plumbing per field) NOR a guaranteed warning ORDER. So we decode
 * field-by-field in the fixed legacy order — the order is load-bearing (asserted by
 * the equivalence proof).
 */

import { Either, Schema } from "effect";
import {
  ConfigSeverity,
  FailOn,
  type IgnoreConfig,
  type IgnoreOverride,
  type TsFixConfig,
} from "./Config.js";

/** Outcome of a sanitize pass: the sanitized config + any warnings raised (RULE-024). */
export interface SanitizeResult {
  readonly config: TsFixConfig;
  readonly warnings: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Schema leaves used for decode-with-fallback. Decoding `unknown` through these
// is the modern replacement for legacy's hand-rolled `isStringArray` / literal
// `===` checks (load-config.ts:26-28,30,44). `Schema.is` would also work; we use
// `decodeUnknownEither` so the validation lives in the Schema layer per the brief.
// ---------------------------------------------------------------------------
const StringArray = Schema.Array(Schema.String);
const decodeStringArray = Schema.decodeUnknownEither(StringArray);
const decodeBoolean = Schema.decodeUnknownEither(Schema.Boolean);
const decodeFailOn = Schema.decodeUnknownEither(FailOn);
const decodeConfigSeverity = Schema.decodeUnknownEither(ConfigSeverity);

/** Is this a plain (non-array, non-null) object? Mirrors legacy `isObject`. */
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Decode a candidate to `string[]`, returning `undefined` when it is not one. */
const asStringArray = (v: unknown): ReadonlyArray<string> | undefined => {
  const decoded = decodeStringArray(v);
  return Either.isRight(decoded) ? decoded.right : undefined;
};

// ---------------------------------------------------------------------------
// ignore (legacy `sanitizeIgnore`, load-config.ts:53-96)
// ---------------------------------------------------------------------------
function sanitizeIgnore(
  value: unknown,
  warnings: string[],
): IgnoreConfig | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warnings.push(`Dropping "ignore": expected an object.`);
    return undefined;
  }

  // Build mutably, then narrow to the readonly contract on return. Field order
  // (rules, files, tags, overrides) matches legacy so warning order is preserved.
  const out: {
    rules?: ReadonlyArray<string>;
    files?: ReadonlyArray<string>;
    tags?: ReadonlyArray<string>;
    overrides?: ReadonlyArray<IgnoreOverride>;
  } = {};

  if (value["rules"] !== undefined) {
    const arr = asStringArray(value["rules"]);
    if (arr !== undefined) out.rules = arr;
    else warnings.push(`Dropping "ignore.rules": expected string[].`);
  }
  if (value["files"] !== undefined) {
    const arr = asStringArray(value["files"]);
    if (arr !== undefined) out.files = arr;
    else warnings.push(`Dropping "ignore.files": expected string[].`);
  }
  if (value["tags"] !== undefined) {
    const arr = asStringArray(value["tags"]);
    if (arr !== undefined) out.tags = arr;
    else warnings.push(`Dropping "ignore.tags": expected string[].`);
  }
  if (value["overrides"] !== undefined) {
    if (Array.isArray(value["overrides"])) {
      const overrides: IgnoreOverride[] = [];
      for (const ov of value["overrides"]) {
        const files = isObject(ov) ? asStringArray(ov["files"]) : undefined;
        if (files !== undefined) {
          // `rules` is OPTIONAL on an override: a bad `rules` is silently omitted
          // (no warning) so long as `files` is valid — legacy load-config.ts:84.
          const rules = isObject(ov) ? asStringArray(ov["rules"]) : undefined;
          overrides.push(rules !== undefined ? { files, rules } : { files });
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

// ---------------------------------------------------------------------------
// rules / categories severity map (legacy `sanitizeSeverityMap`, load-config.ts:32-51)
// ---------------------------------------------------------------------------
function sanitizeSeverityMap(
  value: unknown,
  field: "rules" | "categories",
  warnings: string[],
): Record<string, "error" | "warn" | "off"> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warnings.push(`Dropping "${field}": expected an object.`);
    return undefined;
  }
  const out: Record<string, "error" | "warn" | "off"> = {};
  // `Object.entries` preserves insertion order → per-key warnings come out in the
  // config's own key order, matching legacy.
  for (const [key, v] of Object.entries(value)) {
    const decoded = decodeConfigSeverity(v);
    if (Either.isRight(decoded)) {
      out[key] = decoded.right;
    } else {
      warnings.push(`Dropping "${field}.${key}": expected "error" | "warn" | "off".`);
    }
  }
  return out;
}

/**
 * Sanitize an arbitrary parsed value into a {@link TsFixConfig} (RULE-024).
 *
 * PURE and total — never touches the filesystem and never throws. Use it to
 * validate an already-parsed value (the JSON-on-disk reading is DEFERRED to the
 * effectful phase over `@effect/platform` FileSystem — see TRANSFORMATION_NOTES §3).
 *
 * A config key is set ONLY when its sanitized value is defined (legacy's
 * `exactOptionalPropertyTypes`-friendly conditional assignment): an absent or
 * fully-dropped field leaves no `key: undefined` on the result.
 */
export function sanitizeConfig(raw: unknown): SanitizeResult {
  const warnings: string[] = [];
  if (!isObject(raw)) {
    if (raw !== undefined) {
      warnings.push("Ignoring config: expected a JSON object.");
    }
    return { config: {}, warnings };
  }

  // Build mutably, then return as the readonly `TsFixConfig`. Fields are
  // processed in the fixed legacy order so accumulated warnings come out in
  // that order (load-bearing — see equivalence proof).
  const config: {
    -readonly [K in keyof TsFixConfig]: TsFixConfig[K];
  } = {};

  const ignore = sanitizeIgnore(raw["ignore"], warnings);
  if (ignore !== undefined) config.ignore = ignore;

  if (raw["failOn"] !== undefined) {
    const decoded = decodeFailOn(raw["failOn"]);
    if (Either.isRight(decoded)) {
      config.failOn = decoded.right;
    } else {
      warnings.push(`Dropping "failOn": expected "error" | "warning" | "none".`);
    }
  }

  if (raw["customRulesOnly"] !== undefined) {
    const decoded = decodeBoolean(raw["customRulesOnly"]);
    if (Either.isRight(decoded)) {
      config.customRulesOnly = decoded.right;
    } else {
      warnings.push(`Dropping "customRulesOnly": expected a boolean.`);
    }
  }

  if (raw["plugins"] !== undefined) {
    const plugins = asStringArray(raw["plugins"]);
    if (plugins !== undefined) {
      // Kept on the config so the engine can warn (RULE-024) — NEVER loaded (RULE-039).
      config.plugins = plugins;
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
