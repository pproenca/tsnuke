/**
 * Plugin trust boundary (RULE-039, P0 / BC-18) — THE LOAD-BEARING SECURITY
 * INVARIANT. See legacy `packages/core/src/security/plugins.ts:41-52`.
 *
 * react-doctor auto-`require`d plugins declared in a SCANNED repo's config — a
 * CWE-94 arbitrary-code-execution path. There is nothing to "carry" here: the
 * legacy behavior IS the vulnerability. ts-fix v1 ships a FIRST-PARTY CATALOG
 * ONLY.
 *
 * `loadConfigPlugins` therefore NEVER loads, resolves, requires, imports, or
 * executes anything declared in `config.plugins`. It ALWAYS returns an empty
 * `plugins` list and surfaces a warning per ignored entry. The RCE class is
 * removed BY CONSTRUCTION — there is deliberately NO dynamic-code path
 * (no require / dynamic import / eval / Function constructor / module resolution)
 * anywhere in this file. A by-construction source-scan test enforces that the
 * forbidden tokens never reappear here (see src/test/loadConfigPlugins.test.ts).
 *
 * RULE-039 must NEVER gain a plugin-loading path. Any future opt-in must resolve
 * bare npm names from the TOOL's own node_modules behind an explicit
 * `--allow-plugins` flag — never from the scanned repo — under a separate slice.
 *
 * Plain synchronous pure function (Brief lines 25/91) — NOT `Effect`-wrapped.
 */

import type { TsFixConfig } from "./Config.js";

/** A loaded plugin. v1 produces NONE — the array element type is the future seam. */
export type LoadedPlugin = never;

/** Result of attempting to honor `config.plugins`: always empty `plugins` in v1. */
export interface LoadConfigPluginsResult {
  /** Always `[]` in v1 — no scanned-repo plugin is ever loaded (RULE-039). */
  readonly plugins: ReadonlyArray<LoadedPlugin>;
  /** Names that were declared and ignored (so the CLI can warn). */
  readonly ignored: ReadonlyArray<string>;
  /** Human-readable warnings (one per ignored plugin). */
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Honor `config.plugins` by IGNORING it (RULE-039 / BC-18).
 *
 * Returns an empty `plugins` list regardless of input. Declared string entries
 * are recorded in `ignored` + `warnings` so the caller may warn, but NONE are
 * resolved, required, imported, or executed. This is the by-construction RCE fix.
 */
export function loadConfigPlugins(
  config: TsFixConfig,
): LoadConfigPluginsResult {
  const declared = Array.isArray(config.plugins) ? config.plugins : [];
  const ignored = declared.filter((p): p is string => typeof p === "string");
  const warnings = ignored.map(
    (name) =>
      `Ignoring config plugin "${name}": ts-fix v1 never loads plugins from a scanned repo (BC-18).`,
  );
  // NOTE: there is deliberately no dynamic-code / module-resolution call anywhere
  // here. `plugins` is unconditionally `[]` — the RCE class is gone by construction.
  return { plugins: [], ignored, warnings };
}
