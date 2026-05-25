/**
 * Capability-token computation (RULE-021: capability token earning). Source of truth
 * (READ-ONLY): `legacy/ts-doctor/packages/core/src/discover-ts-project.ts:391-442`
 * (`moduleResolutionToken` + `computeCapabilities`).
 *
 * `computeCapabilities` turns a discovered {@link ProjectInfo} into the `Set<Capability>`
 * that gates which rules run (RULE-019/RULE-020). It is a PURE synchronous derivation
 * over `ProjectInfo` — NO I/O, NO Effect wrapping (matching the established pure-slice
 * convention: `score`, `sanitize`). Wrapping a pure function in a fiber would buy
 * nothing.
 *
 * LOAD-BEARING INVERSION (RULE-020/RULE-021): a strict flag that is OFF emits NO token.
 * That ABSENCE is what fires the inverted-gating `enable-X` CFG rules (`disabledBy:
 * [<flag>]`). A reimplementation that defaulted a missing flag to "on" would invert this
 * behavior — the documented critical rewrite trap. Preserved exactly: only flags
 * recorded `true` in `info.strictFlags` add a token.
 */

import type { Capability } from "@ts-doctor/contracts-effect";
import type { ProjectInfo } from "./ProjectInfo.js";

/**
 * A capability token. DE-VENDORED: this slice used to alias `type Capability = string`
 * locally (matching legacy `@ts-doctor/rules` `Capability = string`,
 * `packages/ts-doctor-rules/src/types.ts:72`); it now re-exports the canonical
 * `Capability` from `@ts-doctor/contracts-effect` (where it is `Schema.String`, whose
 * `.Type` is `string` — structurally identical, an open vocabulary, not a closed union).
 * Imported as a TYPE only (this slice never decodes; `verbatimModuleSyntax` `import type`).
 */
export type { Capability };

/**
 * The `moduleResolution:*` token derived from the module system (RULE-021). Legacy
 * `moduleResolutionToken` (`discover-ts-project.ts:391-398`): `ProjectInfo` carries no
 * explicit `moduleResolution`, so a sensible token is derived from `moduleSystem` —
 * `esm` → `"moduleResolution:bundler"`, else `"moduleResolution:node"`. Never null in
 * practice (every `moduleSystem` maps), but the legacy signature was `Capability | null`
 * and is preserved.
 */
const moduleResolutionToken = (info: ProjectInfo): Capability | null =>
  info.moduleSystem === "esm" ? "moduleResolution:bundler" : "moduleResolution:node";

/**
 * Compute the capability token `Set<Capability>` from a {@link ProjectInfo} (C2,
 * RULE-021). PURE — same input → same output, no I/O.
 *
 * Emits, in this vocabulary (legacy `computeCapabilities`, `:416-442`):
 *  - `"tsconfig"`              ALWAYS (discovery threw `TsconfigNotFoundError` otherwise)
 *  - `"ts:<major.minor>"`     when `tsVersion` is known and matches `^(\d+)\.(\d+)`
 *  - one token PER ON strict flag (15-member family; an OFF flag emits NO token —
 *    the load-bearing inversion, RULE-020)
 *  - `"esm"` | `"cjs"`        (`info.moduleSystem`)
 *  - a `moduleResolution:*`   token (see {@link moduleResolutionToken})
 *  - `"app"` | `"lib"` | `"monorepo"`  (OMITTED when `projectKind === "unknown"`)
 *  - `"build:<tool>"`         (OMITTED when `buildTool === "unknown"`)
 *  - `"typecheck:ok"`         ONLY when `info.typecheckOk` is true — and discovery
 *                             HARDCODES `typecheckOk: false` (PENDING, RULE-021), so
 *                             this token is ALWAYS ABSENT on a discovery-produced
 *                             `ProjectInfo`; the engine reconciles the real value later.
 *
 * Insertion order mirrors legacy field traversal: `tsconfig` → `ts:*` → strict flags
 * (in `info.strictFlags` key order) → module system → moduleResolution → kind → build →
 * typecheck. (`Set` preserves insertion order — relevant only if a consumer iterates;
 * gating uses `.has`, which is order-independent.)
 */
export const computeCapabilities = (info: ProjectInfo): Set<Capability> => {
  const caps = new Set<Capability>();

  // tsconfig is always present (discovery threw TsconfigNotFoundError otherwise).
  caps.add("tsconfig");

  if (info.tsVersion !== null) {
    const m = info.tsVersion.match(/^(\d+)\.(\d+)/);
    if (m) caps.add(`ts:${m[1]}.${m[2]}`);
  }

  for (const [flag, on] of Object.entries(info.strictFlags)) {
    if (on) caps.add(flag);
  }

  caps.add(info.moduleSystem); // "esm" | "cjs"
  const modRes = moduleResolutionToken(info);
  if (modRes !== null) caps.add(modRes);

  if (info.projectKind !== "unknown") caps.add(info.projectKind);
  if (info.buildTool !== "unknown") caps.add(`build:${info.buildTool}`);

  // typecheck:ok is the gated Tier-2 signal — present ONLY when proven. Discovery
  // hardcodes typecheckOk=false, so this is always absent here (RULE-021 PENDING quirk).
  if (info.typecheckOk) caps.add("typecheck:ok");

  return caps;
};
