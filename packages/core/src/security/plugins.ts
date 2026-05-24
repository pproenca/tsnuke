/**
 * Plugin trust boundary (C16, BC-18) — the #1 react-doctor security finding.
 *
 * react-doctor auto-`require`d plugins declared in a *scanned* repo's config —
 * a CWE-94 arbitrary-code-execution path. There is nothing to "carry" here: the
 * legacy behavior *is* the vulnerability. v1 ships a FIRST-PARTY CATALOG ONLY.
 *
 * `loadConfigPlugins` therefore NEVER loads, resolves, or `require`s anything
 * declared in `config.plugins`. It returns an empty list and (optionally)
 * surfaces a warning that the entries were ignored. The RCE class is removed
 * *by construction* — there is no code path that executes scanned-repo plugins.
 *
 * (Future: bare npm names resolved from the *tool's own* `node_modules` behind
 * an explicit `--allow-plugins` flag — never from the scanned repo.)
 *
 * See REIMAGINED_ARCHITECTURE.md §1.6 / AI_NATIVE_SPEC.md §5 (BC-18).
 */

import type { TsDoctorConfig } from "../types.js";

/** A loaded plugin. v1 produces NONE — the array type is for the future seam. */
export type LoadedPlugin = never;

/** Result of attempting to honor `config.plugins`: always empty in v1. */
export interface LoadConfigPluginsResult {
  /** Always `[]` in v1 — no scanned-repo plugin is ever loaded. */
  plugins: LoadedPlugin[];
  /** Names that were declared and ignored (so the CLI can warn). */
  ignored: string[];
  /** Human-readable warnings (one per ignored plugin). */
  warnings: string[];
}

/**
 * Honor `config.plugins` by IGNORING it (BC-18).
 *
 * Returns an empty `plugins` list regardless of input. Declared entries are
 * recorded in `ignored` + `warnings` so the caller may warn, but NONE are
 * resolved, required, imported, or executed. This is the by-construction RCE fix.
 */
export function loadConfigPlugins(
  config: TsDoctorConfig,
): LoadConfigPluginsResult {
  const declared = Array.isArray(config.plugins) ? config.plugins : [];
  const ignored = declared.filter((p): p is string => typeof p === "string");
  const warnings = ignored.map(
    (name) =>
      `Ignoring config plugin "${name}": ts-doctor v1 never loads plugins from a scanned repo (BC-18).`,
  );
  // NOTE: there is deliberately no require/import/resolve call anywhere here.
  return { plugins: [], ignored, warnings };
}
