/**
 * Error serialization for the report's `error` field (RULE-034).
 *
 * A plain synchronous pure function (Modernization Brief line 91) — NOT
 * `Effect`-wrapped. It maps an arbitrary thrown value onto the {@link JsonReportError}
 * wire schema. Behavior preserved verbatim from legacy `build-report.ts:50-61`:
 *
 *  - For an `Error`: `{ message, name, chain }` where `chain` is the `.cause` chain
 *    flattened to messages, ROOT-LAST. The top error's message is in `message`,
 *    NOT in `chain`; each cause's `.message` is appended in walk order, so the
 *    deepest/root cause is the LAST element. The walk stops at the first non-Error
 *    `.cause` (a string/object cause is neither appended nor traversed).
 *  - For a non-Error: `{ message: String(err), name: "UnknownError", chain: [] }`.
 */

import type { JsonReportError } from "./Report.js";

/** Flatten an error and its `.cause` chain to messages, root-last (RULE-034). */
export function serializeError(err: unknown): JsonReportError {
  if (err instanceof Error) {
    const chain: string[] = [];
    let cause: unknown = (err as { cause?: unknown }).cause;
    while (cause instanceof Error) {
      chain.push(cause.message);
      cause = (cause as { cause?: unknown }).cause;
    }
    return { message: err.message, name: err.name, chain };
  }
  return { message: String(err), name: "UnknownError", chain: [] };
}
