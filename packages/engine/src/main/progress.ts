/**
 * Internal helper for the engine's progress emissions.
 *
 * Three slices fire {@link ProgressEvent}s at phase boundaries (runEngine,
 * diagnose, diagnoseWorkspace). All three need the same safety wrap: skip when
 * no sink is provided, swallow any throw so a misbehaving renderer can never
 * poison the engine. This module is the one place that pattern lives — the
 * sites just call `safeEmit(onProgress, event)`.
 */

import type { OnProgress, ProgressEvent } from "@tsnuke/contracts-effect";

/**
 * Fire `event` on `sink` if one is provided. Catches any thrown error from the
 * sink so progress-rendering bugs cannot break the analysis run. Synchronous,
 * never returns a Promise.
 */
export const safeEmit = (sink: OnProgress | undefined, event: ProgressEvent): void => {
  if (sink === undefined) return;
  try {
    sink(event);
  } catch {
    /* a misbehaving renderer must never poison the engine */
  }
};
