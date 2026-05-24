/**
 * Lenient config loading (C11, BC-22).
 *
 * Loads `tsdoctor.config.json` (then `package.json#tsDoctor`) from a directory.
 * The contract is *lenient by construction*: a non-object config is ignored
 * (with a warning), invalid fields are dropped (with a warning), and loading
 * NEVER throws on bad config — a malformed config must not break a scan.
 *
 * See AI_NATIVE_SPEC.md §5 (BC-22).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TsDoctorConfig } from "./types.js";

/** Outcome of a config load: the sanitized config + any warnings raised. */
export interface LoadConfigResult {
  config: TsDoctorConfig;
  warnings: string[];
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
): TsDoctorConfig["ignore"] | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warnings.push(`Dropping "ignore": expected an object.`);
    return undefined;
  }
  const out: NonNullable<TsDoctorConfig["ignore"]> = {};
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
      const overrides: NonNullable<
        NonNullable<TsDoctorConfig["ignore"]>["overrides"]
      > = [];
      for (const ov of value["overrides"]) {
        if (isObject(ov) && isStringArray(ov["files"])) {
          overrides.push({
            files: ov["files"],
            ...(isStringArray(ov["rules"]) ? { rules: ov["rules"] } : {}),
          });
        } else {
          warnings.push(`Dropping an "ignore.overrides" entry: expected { files: string[] }.`);
        }
      }
      out.overrides = overrides;
    } else {
      warnings.push(`Dropping "ignore.overrides": expected an array.`);
    }
  }
  return out;
}

/**
 * Sanitize an arbitrary parsed value into a {@link TsDoctorConfig} (BC-22).
 *
 * Exported so it can be unit-tested against garbage input directly without
 * touching the filesystem. Never throws.
 */
export function sanitizeConfig(raw: unknown): LoadConfigResult {
  const warnings: string[] = [];
  if (!isObject(raw)) {
    if (raw !== undefined) {
      warnings.push("Ignoring config: expected a JSON object.");
    }
    return { config: {}, warnings };
  }

  const config: TsDoctorConfig = {};

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
      // Kept on the config so BC-18 can warn — NEVER loaded (see security/plugins.ts).
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

function tryParseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Load config from a directory (BC-22). Tries `tsdoctor.config.json` first, then
 * `package.json#tsDoctor`. Never throws — returns `{}` on any failure. Use
 * {@link sanitizeConfig} directly to validate an already-parsed value.
 */
export function loadConfig(dir: string): TsDoctorConfig {
  return loadConfigWithWarnings(dir).config;
}

/** As {@link loadConfig} but surfaces the warnings raised during sanitization. */
export function loadConfigWithWarnings(dir: string): LoadConfigResult {
  const configPath = join(dir, "tsdoctor.config.json");
  if (existsSync(configPath)) {
    const raw = tryParseJson(configPath);
    if (raw === undefined) {
      return {
        config: {},
        warnings: [`Ignoring ${configPath}: could not parse as JSON.`],
      };
    }
    return sanitizeConfig(raw);
  }

  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = tryParseJson(pkgPath);
    if (isObject(pkg) && pkg["tsDoctor"] !== undefined) {
      return sanitizeConfig(pkg["tsDoctor"]);
    }
  }

  return { config: {}, warnings: [] };
}
