/**
 * The four ordered filter stages + their helpers (RULE-023, RULE-040).
 *
 * Each stage is a `Diagnostic | null` transform — order is load-bearing and tested
 * (see `runFilterPipeline.ts` for the fixed order and the short-circuit). These are
 * **plain synchronous pure functions — NOT `Effect<...>`-wrapped** (Modernization
 * Brief lines 25/91): wrapping deterministic CPU filtering in fibers buys nothing.
 * The Effect ecosystem appears only in the contract/types layer (`Diagnostic.ts`,
 * `Config.ts` — `effect/Schema`).
 *
 *   1. auto-suppress       — drop diagnostics tagged as known test-noise
 *   2. severity override   — remap per config.rules / config.categories; "off" drops
 *   3. ignore              — drop by ignore.rules / ignore.files / ignore.overrides
 *   4. inline-disable      — honor `// ts-doctor-disable-next-line <rule>` directives
 *
 * D1 — SINGLE CANONICAL SEVERITY VOCABULARY (RULE-040): legacy normalized config's
 * `"warn"` → engine `"warning"` in two places (`load-config.ts` +
 * `filter-pipeline.ts:44-49`) — the vocabulary trap RULE-040 flags. Here the config
 * vocabulary (`ConfigSeverity`, `Config.ts`) is normalized to the canonical
 * `Severity` (`Diagnostic.ts`) in exactly ONE function, {@link normalizeConfigSeverity}.
 * This is behavior-PRESERVING (proven by `equivalence.test.ts`).
 *
 * Source of truth: legacy `packages/core/src/filter-pipeline.ts` (READ-ONLY).
 */

import type { ConfigSeverity, TsDoctorConfig } from "./Config.js";
import type { DiagnosticWithTags, Severity } from "./Diagnostic.js";

/** Source text for files, keyed by absolute path — needed by the inline-disable stage. */
export type SourceTextMap = ReadonlyMap<string, string>;

/** A single stage: returns the (possibly remapped) diagnostic, or null to drop it. */
export type Stage = (d: DiagnosticWithTags) => DiagnosticWithTags | null;

/** Tags whose diagnostics are auto-suppressed as known noise (stage 1). FROZEN — not config. */
export const AUTO_SUPPRESS_TAGS: ReadonlySet<string> = new Set(["test-noise"]);

/**
 * Normalize a config-file severity (`error`/`warn`/`off`, RULE-040) into the
 * canonical engine vocabulary (`error`/`warning`) or the `"off"` drop sentinel.
 * THE single place the `warn`↔`warning` mapping lives (deviation D1).
 */
export function normalizeConfigSeverity(value: ConfigSeverity): Severity | "off" {
  if (value === "off") return "off";
  return value === "warn" ? "warning" : "error";
}

/** Stage 1 — drop diagnostics whose rule is tagged as known test-noise (RULE-023 Stage 1). */
export function stageAutoSuppress(d: DiagnosticWithTags): DiagnosticWithTags | null {
  if (d.tags) {
    for (const tag of d.tags) {
      if (AUTO_SUPPRESS_TAGS.has(tag)) return null;
    }
  }
  return d;
}

/**
 * Stage 2 — apply config.rules / config.categories severity overrides (RULE-023
 * Stage 2, RULE-040). Per-rule overrides take PRECEDENCE over per-category; rule
 * ids match bare `rule` or namespaced `plugin/rule`; `"off"` drops, else remaps.
 */
export function makeSeverityStage(config: TsDoctorConfig): Stage {
  const ruleOverrides = config.rules ?? {};
  const categoryOverrides = config.categories ?? {};
  return (d) => {
    // Rule override takes precedence over category override (RULE-040).
    const ruleOv = ruleOverrides[d.rule] ?? ruleOverrides[`${d.plugin}/${d.rule}`];
    if (ruleOv !== undefined) {
      const sev = normalizeConfigSeverity(ruleOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    const catOv = categoryOverrides[d.category];
    if (catOv !== undefined) {
      const sev = normalizeConfigSeverity(catOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    return d;
  };
}

/** Match a file path against an ignore entry: exact (`===`) / suffix (`endsWith`) / substring (`includes`). */
export function fileMatches(filePath: string, pattern: string): boolean {
  if (filePath === pattern) return true;
  if (filePath.endsWith(pattern)) return true;
  if (filePath.includes(pattern)) return true;
  return false;
}

/** Stage 3 — drop by ignore.rules / ignore.files / ignore.overrides (RULE-023 Stage 3). */
export function makeIgnoreStage(config: TsDoctorConfig): Stage {
  const ignore = config.ignore ?? {};
  const ignoredRules = new Set(ignore.rules ?? []);
  const ignoredFiles = ignore.files ?? [];
  const overrides = ignore.overrides ?? [];
  return (d) => {
    if (ignoredRules.has(d.rule) || ignoredRules.has(`${d.plugin}/${d.rule}`)) {
      return null;
    }
    for (const f of ignoredFiles) {
      if (fileMatches(d.filePath, f)) return null;
    }
    for (const ov of overrides) {
      const fileHit = ov.files.some((f) => fileMatches(d.filePath, f));
      if (!fileHit) continue;
      // overrides with rules: drop only those rules in those files;
      // overrides without rules: drop all diagnostics in those files.
      if (ov.rules === undefined) return null;
      if (ov.rules.includes(d.rule) || ov.rules.includes(`${d.plugin}/${d.rule}`)) {
        return null;
      }
    }
    return d;
  };
}

const DISABLE_NEXT_LINE_RE = /\/\/\s*ts-doctor-disable-next-line\s*(.*)$/;

/** A parsed inline-disable directive: `all` rules, or a specific `rules` set. */
export interface InlineDirective {
  readonly all: boolean;
  readonly rules: ReadonlySet<string>;
}

/**
 * Build the map of (1-based line → directive) for a file (RULE-023 Stage 4).
 * `// ts-doctor-disable-next-line <rule>` disables `<rule>` on the *following* line
 * (target = directive line + 2, 1-based); with no rule listed it disables all rules
 * on the next line. The rule list is split on `[\s,]+`.
 */
export function parseInlineDisables(text: string): Map<number, InlineDirective> {
  const out = new Map<number, InlineDirective>();
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = line.match(DISABLE_NEXT_LINE_RE);
    if (!m) continue;
    const targetLine = i + 2; // 1-based, the NEXT line
    const rest = (m[1] ?? "").trim();
    const ruleNames = rest.length > 0 ? rest.split(/[\s,]+/).filter(Boolean) : [];
    out.set(targetLine, {
      all: ruleNames.length === 0,
      rules: new Set(ruleNames),
    });
  }
  return out;
}

/**
 * Stage 4 — honor inline-disable directives (RULE-023 Stage 4, BC-11/BC-12). A
 * diagnostic with `line <= 0` is exempt. Rule matching accepts bare / `plugin/rule`.
 * Directives are parsed once per file and cached.
 */
export function makeInlineDisableStage(sources: SourceTextMap | undefined): Stage {
  const cache = new Map<string, Map<number, InlineDirective>>();
  const directivesFor = (filePath: string): Map<number, InlineDirective> => {
    const cached = cache.get(filePath);
    if (cached !== undefined) return cached;
    const text = sources?.get(filePath);
    const parsed =
      text !== undefined ? parseInlineDisables(text) : new Map<number, InlineDirective>();
    cache.set(filePath, parsed);
    return parsed;
  };

  return (d) => {
    if (d.line <= 0) return d; // line≤0 cannot be matched to a directive (BC-12)
    const directive = directivesFor(d.filePath).get(d.line);
    if (directive === undefined) return d;
    if (directive.all) return null;
    if (directive.rules.has(d.rule) || directive.rules.has(`${d.plugin}/${d.rule}`)) {
      return null;
    }
    return d;
  };
}
