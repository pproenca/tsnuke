/**
 * Argument parsing for the `inspect` command (the CLI default).
 *
 * Kept as a pure, side-effect-free module so it is fully unit-testable: it takes
 * an argv array and returns a plain {@link InspectFlags} object. No `process`,
 * no IO. The CLI entry (`cli.ts`) is the only place that reads `process.argv`
 * and calls into here.
 *
 * Mirrors the CLI contract in AI_NATIVE_SPEC.md §3.1 and the mutually-exclusive
 * mode rules carried from react-doctor's RULE-042 (BC set §3.3).
 */

/** Which CI-failure gate trips a non-zero exit (BC-21). Default `"error"`. */
export type FailOn = "error" | "warning" | "none";

/** Output shape selector. `--json`/`--score` are kept as their own flags too. */
export type OutputFormat = "pretty" | "json" | "agent";

/**
 * A `file:line` target for `--explain` / `--why`. Parsed from a raw string into
 * its parts; the offline explainer (`explain.ts`) resolves the rule at that
 * location.
 */
export interface FileLine {
  readonly file: string;
  readonly line: number;
}

/** Fully-resolved flags for an `inspect` run. */
export interface InspectFlags {
  /** Positional `[directory]`, default `"."`. */
  directory: string;

  // analysis toggles
  lint: boolean;
  deadCode: boolean;
  /** Tier-2 type-aware pass: `true` force on, `false` force off, `undefined` auto. */
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

  // mode selection
  full: boolean;
  /** `--project a,b,c` → `["a","b","c"]`. */
  projects: string[];
  /** `--diff [base]`: present iff diff mode. `base` may be undefined (current changes). */
  diff: { base: string | undefined } | undefined;
  staged: boolean;

  // gate
  failOn: FailOn;

  // explain (offline)
  explain: FileLine | undefined;
  why: FileLine | undefined;
}

/** Default flag values; the parser mutates a copy of this. */
function defaults(): InspectFlags {
  return {
    directory: ".",
    lint: true,
    deadCode: true,
    deep: undefined,
    verbose: false,
    respectInlineDisables: true,
    score: false,
    showScore: true,
    json: false,
    jsonCompact: false,
    format: "pretty",
    annotations: false,
    prComment: false,
    fix: false,
    yes: false,
    full: false,
    projects: [],
    diff: undefined,
    staged: false,
    failOn: "error",
    explain: undefined,
    why: undefined,
  };
}

/** Error thrown for malformed argv or incompatible flag combinations. */
export class FlagError extends Error {
  override readonly name = "FlagError";
}

const FAIL_ON_VALUES: ReadonlySet<string> = new Set(["error", "warning", "none"]);
const FORMAT_VALUES: ReadonlySet<string> = new Set(["pretty", "json", "agent"]);

/** Parse a `file:line` target, e.g. `src/a.ts:42`. Throws on malformed input. */
export function parseFileLine(raw: string): FileLine {
  // Split on the LAST colon so Windows-style drive letters / paths with colons
  // are tolerated; the trailing segment must be a positive integer line.
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

/** Read the value that follows a flag, advancing the cursor. Throws if missing. */
function takeValue(argv: readonly string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new FlagError(`${flag} requires a value.`);
  }
  return next;
}

/**
 * Parse `inspect` argv into {@link InspectFlags}. The argv passed in must
 * already have the node/script prefix and any leading command word stripped.
 *
 * Unknown `--flags` throw; bare positionals after the first are also rejected
 * (only one `[directory]` is allowed).
 */
export function parseInspectFlags(argv: readonly string[]): InspectFlags {
  const flags = defaults();
  let sawDirectory = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    switch (arg) {
      // analysis toggles
      case "--lint":
        flags.lint = true;
        break;
      case "--no-lint":
        flags.lint = false;
        break;
      case "--dead-code":
        flags.deadCode = true;
        break;
      case "--no-dead-code":
        flags.deadCode = false;
        break;
      case "--deep":
        flags.deep = true;
        break;
      case "--no-deep":
        flags.deep = false;
        break;
      case "--verbose":
        flags.verbose = true;
        break;
      case "--respect-inline-disables":
        flags.respectInlineDisables = true;
        break;
      case "--no-respect-inline-disables":
        flags.respectInlineDisables = false;
        break;

      // output selectors
      case "--score":
        flags.score = true;
        break;
      case "--no-score":
        flags.showScore = false;
        break;
      case "--json":
        flags.json = true;
        flags.format = "json";
        break;
      case "--json-compact":
        flags.json = true;
        flags.jsonCompact = true;
        flags.format = "json";
        break;
      case "--format": {
        const value = takeValue(argv, i, "--format");
        if (!FORMAT_VALUES.has(value)) {
          throw new FlagError(`--format must be one of pretty|json|agent, got "${value}".`);
        }
        flags.format = value as OutputFormat;
        if (value === "json") flags.json = true;
        i++;
        break;
      }
      case "--annotations":
        flags.annotations = true;
        break;
      case "--pr-comment":
        flags.prComment = true;
        break;

      // mutation
      case "--fix":
        flags.fix = true;
        break;
      case "-y":
      case "--yes":
        flags.yes = true;
        break;

      // mode selection
      case "--full":
        flags.full = true;
        break;
      case "--project": {
        const value = takeValue(argv, i, "--project");
        flags.projects = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        i++;
        break;
      }
      case "--diff": {
        // `--diff` takes an OPTIONAL base. If the next token looks like a value
        // (not a flag), consume it as the base; otherwise current-changes diff.
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.diff = { base: next };
          i++;
        } else {
          flags.diff = { base: undefined };
        }
        break;
      }
      case "--staged":
        flags.staged = true;
        break;

      // gate
      case "--fail-on": {
        const value = takeValue(argv, i, "--fail-on");
        if (!FAIL_ON_VALUES.has(value)) {
          throw new FlagError(`--fail-on must be one of error|warning|none, got "${value}".`);
        }
        flags.failOn = value as FailOn;
        i++;
        break;
      }

      // explain (offline)
      case "--explain": {
        flags.explain = parseFileLine(takeValue(argv, i, "--explain"));
        i++;
        break;
      }
      case "--why": {
        flags.why = parseFileLine(takeValue(argv, i, "--why"));
        i++;
        break;
      }

      default: {
        if (arg.startsWith("-")) {
          throw new FlagError(`Unknown flag: ${arg}`);
        }
        if (sawDirectory) {
          throw new FlagError(`Unexpected extra argument: ${arg}`);
        }
        flags.directory = arg;
        sawDirectory = true;
        break;
      }
    }
  }

  return flags;
}

/**
 * Reject incompatible flag combinations (carries react-doctor's RULE-042 set).
 * Throws {@link FlagError} on the first violation found; returns void otherwise.
 *
 * Incompatible combos:
 *  - `--staged` + `--diff`            (two mutually exclusive modes)
 *  - `--score` + `--json`            (two different "only this output" modes)
 *  - `--pr-comment` + (`--json` | `--score`)
 *  - `--annotations` + (`--json` | `--score`)
 *  - `--explain` + (`--json` | `--score` | `--annotations` | `--staged`)
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
