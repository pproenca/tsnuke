/**
 * Config contract for the security guards — DE-VENDORED.
 *
 * This slice previously vendored a BARE `interface { plugins?: readonly string[] }` —
 * just the one field {@link ./Plugins.ts loadConfigPlugins} reads. That contract is now
 * consolidated in `@ts-doctor/contracts-effect` (the canonical `effect/Schema` home).
 * The canonical `TsDoctorConfig` is a proven structural SUPERSET that includes
 * `plugins?: readonly string[]`, so `loadConfigPlugins` reads `config.plugins` unchanged.
 * Re-exported here as a type to preserve the public surface and keep the `./Config.js`
 * import path stable across the slice.
 *
 * `plugins` is "present only so it can be warned about" — v1 IGNORES it and NEVER loads
 * it (RULE-039 / BC-18). De-vendoring the TYPE does not touch that behavior.
 */

export type { TsDoctorConfig } from "@ts-doctor/contracts-effect";
