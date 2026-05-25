/**
 * The resolved `inspect`-run flag shape + the RULE-028 mode-exclusivity validation
 * and the `<file>:<line>` parser — the PURE half of the CLI.
 *
 * ── Re-imagining note ────────────────────────────────────────────────────────────
 * Legacy hand-rolled `legacy/.../packages/tsnuke/src/flags.ts` (323 LOC) with a
 * bespoke argv `switch` (`parseInspectFlags`) plus a `validateModeFlags` gate. On
 * `@effect/cli`, argv→record parsing is the library's job (POSIX, auto-help,
 * completions), so `parseInspectFlags` is GONE — `inspectCommand.ts` declares the same
 * flag surface as `Options`. What stays here:
 *   1. {@link InspectFlags} — the resolved shape the handler consumes (same fields,
 *      same semantics as legacy, incl. the RULE-035 `deep` tri-state and the
 *      RULE-033 `diff`/`staged` mode labels).
 *   2. {@link validateModeFlags} — RULE-028's mutually-exclusive set, kept as a PURE
 *      predicate over the resolved record. `inspectCommand.ts` runs it as an
 *      `Options.mapEffect` constraint so contradictory combos are rejected BY THE
 *      PARSER with a clear message (the `@effect/cli` idiom), but the rejection set is
 *      authored here, once, and unit-tested directly. Equivalence is BEHAVIORAL: the
 *      SAME combos are rejected with the SAME wording, not the same control flow.
 *   3. {@link parseFileLine} — the `<file>:<line>` target parser for `--explain`/`--why`,
 *      ported VERBATIM (split-on-last-colon, positive-integer line).
 *
 * Equivalence bar: same flags accepted, same validation rejections, same defaults.
 */

/** Which CI-failure gate trips a non-zero exit (RULE-030). Default `"error"`. */
export type FailOn = "error" | "warning" | "none";

/** Output shape selector. `--json`/`--score` are kept as their own flags too. */
export type OutputFormat = "pretty" | "json" | "agent";

/** A `file:line` target for `--explain`/`--why` (RULE-028 malformed-target case). */
export interface FileLine {
  readonly file: string;
  readonly line: number;
}

/**
 * Fully-resolved flags for an `inspect` run — the handler's input. Field-for-field the
 * legacy `InspectFlags` shape (`legacy/.../flags.ts:30-70`), so the handler port is a
 * mechanical 1:1. The RULE-035 `deep` tri-state is `boolean | undefined` (force-on /
 * force-off / auto); the RULE-033 mode is carried by `diff` + `staged`.
 */
export interface InspectFlags {
  /** Positional `[directory]`, default `"."`. */
  directory: string;

  // analysis toggles
  lint: boolean;
  deadCode: boolean;
  /** Tier-2 type-aware pass: `true` force on, `false` force off, `undefined` auto (RULE-035). */
  deep: boolean | undefined;
  verbose: boolean;
  respectInlineDisables: boolean;

  // output selectors
  score: boolean;
  /** When `false`, suppress the score even in pretty output (`--no-score`). */
  showScore: boolean;
  json: boolean;
  jsonCompact: boolean;
  format: OutputFormat;
  annotations: boolean;
  prComment: boolean;

  // mutation
  fix: boolean;
  yes: boolean;

  // mode selection (RULE-033)
  full: boolean;
  /** `--project a,b,c` → `["a","b","c"]`. */
  projects: string[];
  /** `--diff [base]`: present iff diff mode. `base` may be undefined (current changes). */
  diff: { base: string | undefined } | undefined;
  staged: boolean;

  // gate (RULE-030)
  failOn: FailOn;

  // explain (offline)
  explain: FileLine | undefined;
  why: FileLine | undefined;
}

/**
 * Error for an incompatible flag combination (RULE-028). Carried from legacy
 * `FlagError`; `inspectCommand.ts` translates a thrown one into a `@effect/cli`
 * `ValidationError` so the parser rejects with the same message text.
 */
export class FlagError extends Error {
  override readonly name = "FlagError";
}

/**
 * Parse a `<file>:<line>` target, e.g. `src/a.ts:42`. Throws {@link FlagError} on
 * malformed input. Ported VERBATIM from legacy `flags.ts:108-124`: split on the LAST
 * colon (tolerate Windows drive letters / colons in the path), trailing segment must be
 * a positive integer line.
 */
export function parseFileLine(raw: string): FileLine {
  const idx = raw.lastIndexOf(":");
  if (idx <= 0 || idx === raw.length - 1) {
    throw new FlagError(`Expected <file:line>, got "${raw}".`);
  }
  const file = raw.slice(0, idx);
  const lineStr = raw.slice(idx + 1);
  if (!/^\d+$/.test(lineStr)) {
    throw new FlagError(`Expected an integer line in "${raw}".`);
  }
  const line = Number.parseInt(lineStr, 10);
  if (line <= 0) throw new FlagError(`Line must be >= 1 in "${raw}".`);
  return { file, line };
}

/**
 * Reject incompatible flag combinations (RULE-028). Throws {@link FlagError} on the
 * FIRST violation found; returns void otherwise. The mutually-exclusive set is ported
 * VERBATIM from legacy `validateModeFlags` (`flags.ts:302-323`):
 *
 *  - `--staged` + `--diff`
 *  - `--score` + `--json`
 *  - `--pr-comment` + (`--json` | `--score`)
 *  - `--annotations` + (`--json` | `--score`)
 *  - `--explain` + (`--json` | `--score` | `--annotations` | `--staged`)
 *
 * `inspectCommand.ts` runs this inside an `Options.mapEffect` so a violation surfaces as
 * a parser `ValidationError` (same message), making RULE-028 an `Options` CONSTRAINT.
 */
export function validateModeFlags(flags: InspectFlags): void {
  if (flags.staged && flags.diff !== undefined) {
    throw new FlagError("--staged and --diff are mutually exclusive.");
  }
  if (flags.score && flags.json) {
    throw new FlagError("--score and --json are mutually exclusive.");
  }
  if (flags.prComment && (flags.json || flags.score)) {
    throw new FlagError("--pr-comment cannot be combined with --json or --score.");
  }
  if (flags.annotations && (flags.json || flags.score)) {
    throw new FlagError("--annotations cannot be combined with --json or --score.");
  }
  if (
    flags.explain !== undefined &&
    (flags.json || flags.score || flags.annotations || flags.staged)
  ) {
    throw new FlagError(
      "--explain cannot be combined with --json, --score, --annotations, or --staged.",
    );
  }
}
