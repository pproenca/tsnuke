/**
 * Subprocess environment sanitization (RULE-027, BC-19). FROZEN verbatim —
 * see legacy `packages/core/src/security/env.ts:13-29`.
 *
 * Any subprocess (git, or a future tsgolint engine) must be spawned array-arg,
 * no shell, with a sanitized environment: strip `NODE_OPTIONS` and `NODE_DEBUG`
 * (code-injection / behavior-override vectors) and every `npm_config_*` var
 * (can redirect installs / registries / scripts).
 *
 * DORMANT (RULE-027): no subprocess spawn calls this yet — wire it at the spawn
 * sink and assert invocation (TRANSFORMATION_NOTES.md Follow-ups). Plain
 * synchronous pure function (Brief lines 25/91) — NOT `Effect`-wrapped, and it
 * does NOT mutate its input.
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
