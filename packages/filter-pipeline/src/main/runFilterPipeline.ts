/**
 * The four-stage diagnostic filter pipeline orchestration (RULE-023, BC-11).
 *
 * Runs the four ORDERED stages over a diagnostic set; a diagnostic dropped by an
 * earlier stage NEVER reaches a later one (short-circuit). The stage ORDER is
 * load-bearing and explicit here:
 *
 *   1. auto-suppress       — drop diagnostics tagged as known test-noise
 *   2. severity override   — remap per config.rules / config.categories; "off" drops
 *   3. ignore              — drop by ignore.rules / ignore.files / ignore.overrides
 *   4. inline-disable      — honor `// tsnuke-disable-next-line <rule>` directives
 *
 * Inline-disable (stage 4) only runs when `respectInlineDisables !== false` AND
 * source text was supplied. The engine-only `tags` field is STRIPPED before the
 * public `Diagnostic` is emitted (RULE-023 edge case).
 *
 * **This is the last gate before scoring — a bug here silently changes the score**
 * (RULE-023, BUSINESS_RULES.md:422). Behavior is proven byte-for-byte equivalent to
 * legacy by `src/test/equivalence.test.ts`.
 *
 * Like the stage functions, this is a **plain synchronous pure function — NOT
 * `Effect`-wrapped** (Modernization Brief lines 25/91). Effect appears only in the
 * `Diagnostic`/`Config` Schema contracts.
 *
 * Source of truth: legacy `packages/core/src/filter-pipeline.ts:189-218` (READ-ONLY).
 */

import type { TsNukeConfig } from "./Config.js";
import type { Diagnostic, DiagnosticWithTags } from "./Diagnostic.js";
import {
  makeIgnoreStage,
  makeInlineDisableStage,
  makeSeverityStage,
  stageAutoSuppress,
  type SourceTextMap,
  type Stage,
} from "./stages.js";

/** Options controlling pipeline behavior. */
export interface FilterPipelineOptions {
  /** Honor inline-disable directives (stage 4). Default true. */
  respectInlineDisables?: boolean;
  /** File text by absolute path, for the inline-disable stage. */
  sources?: SourceTextMap;
}

/**
 * Run the four ordered filter stages over `diagnostics` (RULE-023, BC-11).
 *
 * Stages run in fixed order; a diagnostic dropped by an earlier stage is never seen
 * by a later one. Returns the surviving public {@link Diagnostic}s (engine-only
 * `tags` stripped), in input order.
 */
export function runFilterPipeline(
  diagnostics: readonly DiagnosticWithTags[],
  config: TsNukeConfig,
  options: FilterPipelineOptions = {},
): Diagnostic[] {
  const respectInline = options.respectInlineDisables !== false;

  // Fixed, load-bearing stage order (RULE-023): auto-suppress (1) → severity (2) →
  // ignore (3) → inline-disable (4, only when enabled). Order MUST NOT change.
  const stages: Stage[] = [
    stageAutoSuppress, // 1
    makeSeverityStage(config), // 2
    makeIgnoreStage(config), // 3
    ...(respectInline ? [makeInlineDisableStage(options.sources)] : []), // 4
  ];

  // Thread each diagnostic through the stages in order; once a stage drops it
  // (returns null) the later stages never see it (short-circuit). Survivors keep
  // input order; the engine-only `tags` field is stripped before emit.
  return diagnostics.flatMap((d) => {
    const survivor = stages.reduce<DiagnosticWithTags | null>(
      (current, stage) => (current === null ? null : stage(current)),
      d,
    );
    if (survivor === null) return [];
    const { tags: _tags, ...rest } = survivor;
    void _tags;
    return [rest];
  });
}
