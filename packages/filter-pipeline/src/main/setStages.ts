/**
 * Set-level filter stage (catalog-hygiene addition, 2026-05-28).
 *
 * Distinguished from `stages.ts` (which holds per-diagnostic stages of shape
 * `(d) => d | null`) by operating on the WHOLE diagnostic SET at once. Runs AFTER the
 * per-diagnostic stages — so by the time it fires, severity overrides, ignore lists,
 * and inline-disables have already shaped the set; this stage then collapses
 * cross-rule duplication that the per-diagnostic stages CANNOT see.
 *
 * One stage lives here, motivated by the catalog audit on `maddie-native`:
 *
 *   {@link suppressByHierarchy} — when a "more specific" rule fires on a span, its
 *   documented downstream rules are dropped on the same `(filePath, line)`. Example:
 *   `no-assertion-on-json-parse` firing on `return JSON.parse(s) as User` already
 *   covers the consequences `no-cast-in-return` and `no-unsafe-return` would flag on
 *   the same line; stacking three findings on one defect is noise.
 *
 * (A blanket "1 per (file, line, category)" cap was tried and reverted — distinct
 * rules within the same category legitimately co-fire on the same line, e.g.
 * `no-explicit-any` + `no-record-string-unknown` on `: Record<string, unknown>`. The
 * category cap was too aggressive; the hierarchy is the precise tool for the
 * documented overlaps.)
 *
 * Pure synchronous function over a `readonly DiagnosticWithTags[]`. The suppression
 * map is data (a `Record`); a future config knob can shadow or extend it without
 * touching this module's shape.
 */

import type { DiagnosticWithTags } from "./Diagnostic.js";

/**
 * The suppression hierarchy: when the KEY rule fires on `(filePath, line)`, every
 * rule in the VALUE list is dropped from the same `(filePath, line)`.
 *
 * Entries are documented by the 2026-05-28 catalog audit. Each "specific" rule
 * already names the underlying defect — its consequences are redundant noise.
 */
export const DEFAULT_SUPPRESSION_HIERARCHY: Readonly<Record<string, readonly string[]>> = {
  // `JSON.parse(...) as T` is the real defect — validate, don't cast. The cast IS
  // a return-cast (no-cast-in-return) and the parsed value IS unsafely returned
  // (no-unsafe-return), but those are downstream consequences of the same line.
  "no-assertion-on-json-parse": ["no-cast-in-return", "no-unsafe-return"],
  // `if (typeof v !== "object") throw; return v as T` is the real defect — write a
  // type predicate. The cast IS a return-cast and IS an object-literal assertion,
  // but those would not exist if the guard were a predicate.
  "no-cast-after-guard": ["no-unsafe-object-assertion", "no-cast-in-return"],
  // `a?.b!` is the real defect — the optional-chain rule names the interaction
  // precisely; the generic non-null-assertion rule's message is weaker on the same `!`.
  "no-non-null-asserted-optional-chain": ["no-non-null-assertion"],
};

/**
 * Drop a diagnostic when a more-specific sibling rule fires on the same `(filePath,
 * line)`. Pure: input set → filtered set, no other side effects. Diagnostics not
 * mentioned in the hierarchy (either as specifier or as victim) pass through unchanged.
 *
 * The hierarchy is `(specifier → victims)`. Implementation:
 *   1. Walk once to build `(filePath:line) → Set<rule>` for specifier rules.
 *   2. Walk again, dropping any diagnostic whose `rule` is listed as a victim of
 *      some specifier ALSO present on the same `(filePath, line)`.
 *
 * Stable in input order for the surviving diagnostics.
 */
export function suppressByHierarchy(
  diagnostics: readonly DiagnosticWithTags[],
  hierarchy: Readonly<Record<string, readonly string[]>> = DEFAULT_SUPPRESSION_HIERARCHY,
): DiagnosticWithTags[] {
  // Build a reverse index: which rules are victims, keyed by specifier.
  const specifiers = new Set(Object.keys(hierarchy));
  // For each line, the set of specifier rules that fired there.
  const linesByKey = new Map<string, Set<string>>();
  for (const d of diagnostics) {
    if (!specifiers.has(d.rule)) continue;
    const key = `${d.filePath}:${d.line}`;
    const set = linesByKey.get(key) ?? new Set<string>();
    set.add(d.rule);
    if (!linesByKey.has(key)) linesByKey.set(key, set);
  }

  return diagnostics.filter((d) => {
    const activeSpecifiers = linesByKey.get(`${d.filePath}:${d.line}`);
    if (activeSpecifiers === undefined) return true;
    // Is `d.rule` a victim of any specifier on this line?
    for (const specifier of activeSpecifiers) {
      const victims = hierarchy[specifier];
      if (victims === undefined) continue;
      if (victims.includes(d.rule)) return false;
    }
    return true;
  });
}

