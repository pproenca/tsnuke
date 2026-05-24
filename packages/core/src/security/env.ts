/**
 * Subprocess environment sanitization (C16, BC-19). FROZEN verbatim.
 *
 * Any subprocess (git, or a future tsgolint engine) is spawned array-arg, no
 * shell, with a sanitized environment: strip `NODE_OPTIONS` and `NODE_DEBUG`
 * (code-injection / behavior-override vectors) and every `npm_config_*` var
 * (can redirect installs / registries / scripts).
 *
 * See AI_NATIVE_SPEC.md §3.6 — "Freeze verbatim."
 */

/** Exact env var names dropped before spawning a subprocess. */
const STRIPPED_KEYS: ReadonlySet<string> = new Set(["NODE_OPTIONS", "NODE_DEBUG"]);
/** Prefix of env var names dropped before spawning a subprocess. */
const STRIPPED_PREFIX = "npm_config_";

/**
 * Return a shallow copy of `env` with the dangerous keys removed (BC-19).
 * Pure — does not mutate the input.
 */
export function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (STRIPPED_KEYS.has(key)) continue;
    if (key.startsWith(STRIPPED_PREFIX)) continue;
    out[key] = value;
  }
  return out;
}
