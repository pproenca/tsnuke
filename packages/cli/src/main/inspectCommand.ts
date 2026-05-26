/**
 * The `inspect` command (the CLI default), built on `@effect/cli` `Command` / `Options`
 * / `Args`. This is the RE-IMAGINING of the hand-rolled `parseInspectFlags` argv switch:
 * the library does POSIX parsing, `--help`, and completions; we declare the SAME flag
 * surface as `Options` and resolve them into the proven {@link InspectFlags} shape.
 *
 * ── RULE-028 as `Options` CONSTRAINTS ────────────────────────────────────────────────
 * The mutually-exclusive set (legacy `validateModeFlags`) is enforced as an
 * `Options.mapEffect` over the COMBINED options record: the combinator resolves the raw
 * record → `InspectFlags`, then runs the pure `validateModeFlags` (flags.ts). On the
 * first violation it FAILS the option-decode with a `ValidationError.invalidValue`
 * carrying the SAME message text as legacy — so a contradictory combo is rejected BY THE
 * PARSER (no handler runs, exit is the parser's non-zero), exactly the brief's
 * "RULE-028 becomes Options constraints". `--format`/`--fail-on` domain validation is
 * handled UPSTREAM by `Options.choice` (an out-of-set value is a parser error before this
 * runs); the malformed `<file>:<line>` case is validated here via `parseFileLine` inside
 * the same `mapEffect` (a thrown `FlagError` → `ValidationError`). Equivalence is
 * BEHAVIORAL: same combos rejected, same wording.
 *
 * The handler maps the resolved `InspectFlags` onto {@link runInspect} (inspectHandler),
 * wiring the REAL IO seam: `Terminal` for stdout/stderr, `diagnoseNode` for the engine,
 * `applyFixesToFilesNode` for `--fix`, and the global rule catalog for `--explain`.
 */

import { Args, Command, Options, ValidationError } from "@effect/cli";
import { HelpDoc } from "@effect/cli";
import { Terminal } from "@effect/platform";
import { Effect, Either, Option } from "effect";
import type { RuleMeta } from "@tsnuke/contracts-effect";
import { diagnoseWorkspaceNode } from "@tsnuke/engine-effect";
import { applyFixesToFilesNode } from "@tsnuke/fix-applier-effect";
import { graphRuleRegistry, ruleRegistry } from "@tsnuke/rules-registry-effect";
import {
  FlagError,
  parseFileLine,
  validateModeFlags,
  type FailOn,
  type FileLine,
  type InspectFlags,
  type OutputFormat,
} from "./flags.js";
import { runInspect, type InspectIo } from "./inspectHandler.js";

// ── The positional `[directory]` argument (default ".") ──────────────────────────────
const directoryArg = Args.directory({ name: "directory" }).pipe(
  Args.withDefault("."),
  Args.withDescription("The project directory to inspect (default: current directory)."),
);

// ── analysis toggles ─────────────────────────────────────────────────────────────────
/**
 * A REAL tri-state boolean, built from two presence flags. This is the CORRECT
 * replacement for `Options.boolean(name, { negationNames }).pipe(Options.optional)`,
 * which CANNOT express a tri-state in `@effect/cli`: a boolean option always resolves
 * (absent ⇒ `false`), so `optional` yields `Some(false)`, never `None`. That collapsed
 * "auto" / "default-on" into "force-off" — silently disabling the type-aware Tier-2,
 * dropping the score line, and ignoring inline-disables on every default run.
 *
 *   `--name`     ⇒ `Some(true)`   (force on)
 *   `--negName`  ⇒ `Some(false)`  (force off)
 *   neither      ⇒ `None`         (caller's default — via `getOrElse`/`getOrUndefined`)
 *   BOTH         ⇒ a parser `ValidationError` (the mutual-exclusivity the negatable
 *                  boolean used to give for free).
 *
 * The result type is `Options<Option<boolean>>` — IDENTICAL to the old `optional` shape —
 * so `resolveInspectFlags` (and its tests) consume it unchanged; only the absent case is
 * now honestly `None` instead of `Some(false)`.
 */
const triStateBoolean = (
  name: string,
  negName: string,
  description: string,
): Options.Options<Option.Option<boolean>> =>
  Options.all({
    on: Options.boolean(name),
    off: Options.boolean(negName),
  }).pipe(
    Options.mapEffect(({ on, off }) =>
      on && off
        ? Effect.fail(
            ValidationError.invalidValue(
              HelpDoc.p(`--${name} and --${negName} are mutually exclusive.`),
            ),
          )
        : Effect.succeed(
            on
              ? Option.some(true)
              : off
                ? Option.some(false)
                : Option.none<boolean>(),
          ),
    ),
    Options.withDescription(description),
  );

const lintOpt = triStateBoolean(
  "lint",
  "no-lint",
  "Run lint-tier rules (default on; --no-lint to disable).",
);
const deadCodeOpt = triStateBoolean(
  "dead-code",
  "no-dead-code",
  "Run dead-code rules (default on; --no-dead-code to disable).",
);
// RULE-035 deep tri-state: None ⇒ AUTO (undefined), Some(true) ⇒ force on,
// Some(false) ⇒ force off. (Was a broken boolean+optional that always read Some(false).)
const deepOpt = triStateBoolean(
  "deep",
  "no-deep",
  "Force the type-aware Tier-2 pass on/off (--deep/--no-deep); omit to auto-decide.",
);
const verboseOpt = Options.boolean("verbose").pipe(
  Options.withDescription("Verbose engine output."),
);
const respectInlineDisablesOpt = triStateBoolean(
  "respect-inline-disables",
  "no-respect-inline-disables",
  "Honour inline-disable directives (default on).",
);

// ── output selectors ─────────────────────────────────────────────────────────────────
const formatOpt = Options.choice("format", ["pretty", "json", "agent"]).pipe(
  Options.withDefault("pretty" as OutputFormat),
  Options.withDescription("Output format: pretty | json | agent (default: pretty)."),
);
const failOnOpt = Options.choice("fail-on", ["error", "warning", "none"]).pipe(
  Options.withDefault("error" as FailOn),
  Options.withDescription(
    "Exit-code gate: error | warning | none (default: error). RULE-030.",
  ),
);
const scoreOpt = Options.boolean("score").pipe(
  Options.withDescription("Print only the score line; never gates (exit 0)."),
);
const showScoreOpt = triStateBoolean(
  "show-score",
  "no-score",
  "Show the score in pretty output (default on; --no-score off).",
);
const jsonOpt = Options.boolean("json").pipe(
  Options.withDescription("Emit the versioned JSON report (RULE-034)."),
);
const jsonCompactOpt = Options.boolean("json-compact").pipe(
  Options.withDescription("Emit the JSON report with no indentation (implies --json)."),
);
const annotationsOpt = Options.boolean("annotations").pipe(
  Options.withDescription("Emit CI annotations."),
);
const prCommentOpt = Options.boolean("pr-comment").pipe(
  Options.withDescription("Emit a PR-comment body."),
);

// ── mutation ─────────────────────────────────────────────────────────────────────────
const fixOpt = Options.boolean("fix").pipe(
  Options.withDescription("Apply safe auto-fix edits in place (atomic, symlink-safe)."),
);
const yesOpt = Options.boolean("yes").pipe(
  Options.withAlias("y"),
  Options.withDescription("Assume yes to prompts."),
);
const noColorOpt = Options.boolean("no-color").pipe(
  Options.withDescription("Disable ANSI colour in pretty output (also honours NO_COLOR / non-TTY)."),
);

// ── mode selection (RULE-033 — labels only; file-selection is a STUB) ─────────────────
const fullOpt = Options.boolean("full").pipe(
  Options.withDescription("Full-tree scan (the default mode)."),
);
const projectOpt = Options.text("project").pipe(
  Options.optional,
  Options.withDescription("Comma-separated project paths to narrow the scan."),
);
// `@effect/cli` is POSIX: a flag does not optionally consume the next token. Legacy's
// `--diff [base]` is split into a boolean `--diff` (mode label) + an optional
// `--diff-base <ref>` (the base). RE-IMAGINED; documented in TRANSFORMATION_NOTES.
const diffOpt = Options.boolean("diff").pipe(
  Options.withDescription("Diff mode label (RULE-033). File-selection is a STUB."),
);
const diffBaseOpt = Options.text("diff-base").pipe(
  Options.optional,
  Options.withDescription("Base ref for --diff (e.g. main); optional."),
);
const stagedOpt = Options.boolean("staged").pipe(
  Options.withDescription("Staged mode label (RULE-033). File-selection is a STUB."),
);

// ── explain (offline) ────────────────────────────────────────────────────────────────
const explainOpt = Options.text("explain").pipe(
  Options.optional,
  Options.withDescription("Explain the rule at <file:line> (offline; never gates)."),
);
const whyOpt = Options.text("why").pipe(
  Options.optional,
  Options.withDescription("Alias of --explain: explain the rule at <file:line>."),
);

/** The COMBINED raw options record `@effect/cli` parses (before resolution/validation). */
const rawOptions = Options.all({
  lint: lintOpt,
  deadCode: deadCodeOpt,
  deep: deepOpt,
  verbose: verboseOpt,
  respectInlineDisables: respectInlineDisablesOpt,
  format: formatOpt,
  failOn: failOnOpt,
  score: scoreOpt,
  showScore: showScoreOpt,
  json: jsonOpt,
  jsonCompact: jsonCompactOpt,
  annotations: annotationsOpt,
  prComment: prCommentOpt,
  fix: fixOpt,
  yes: yesOpt,
  noColor: noColorOpt,
  full: fullOpt,
  project: projectOpt,
  diff: diffOpt,
  diffBase: diffBaseOpt,
  staged: stagedOpt,
  explain: explainOpt,
  why: whyOpt,
});

/** Translate a `<file:line>` flag value via `parseFileLine`, failing as a parser error. */
const decodeFileLine = (
  raw: Option.Option<string>,
): Effect.Effect<FileLine | undefined, ValidationError.ValidationError> =>
  Option.match(raw, {
    onNone: () => Effect.succeed(undefined),
    onSome: (value) =>
      Effect.try({
        try: () => parseFileLine(value),
        catch: (e) =>
          ValidationError.invalidValue(
            HelpDoc.p(e instanceof FlagError ? e.message : String(e)),
          ),
      }),
  });

/**
 * Resolve the raw options record into {@link InspectFlags}, then enforce RULE-028. The
 * `directory` positional is threaded in by the caller (it is an `Args`, parsed
 * separately) — here `directory` defaults to `"."` and is overwritten in the handler.
 * A `validateModeFlags` violation FAILS the decode with a `ValidationError` (parser
 * rejection), so RULE-028 is an `Options` constraint.
 */
export const resolveInspectFlags = Effect.fn("Cli.resolveFlags")(function* (
  raw: typeof rawOptions extends Options.Options<infer A> ? A : never,
) {
    const explain = yield* decodeFileLine(raw.explain);
    const why = yield* decodeFileLine(raw.why);

    // `--json-compact` implies `--json`; `--format json` implies `--json` (legacy: both
    // set `flags.json = true` and `format = "json"`).
    const json = raw.json || raw.jsonCompact || raw.format === "json";
    const format: OutputFormat = json ? "json" : raw.format;

    const projects = Option.match(raw.project, {
      onNone: () => [] as string[],
      onSome: (v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
    });

    const diff = raw.diff
      ? { base: Option.getOrUndefined(raw.diffBase) }
      : undefined;

    // Colour: opt OUT via `--no-color` or NO_COLOR env, opt OUT in non-TTY / CI.
    const env = process.env;
    const ttyColor = Boolean(process.stdout.isTTY) && env["NO_COLOR"] === undefined && env["CI"] === undefined;
    const color = !raw.noColor && ttyColor;

    const flags: Omit<InspectFlags, "directory"> = {
      lint: Option.getOrElse(raw.lint, () => true),
      deadCode: Option.getOrElse(raw.deadCode, () => true),
      deep: Option.getOrUndefined(raw.deep),
      verbose: raw.verbose,
      respectInlineDisables: Option.getOrElse(raw.respectInlineDisables, () => true),
      score: raw.score,
      showScore: Option.getOrElse(raw.showScore, () => true),
      json,
      jsonCompact: raw.jsonCompact,
      format,
      annotations: raw.annotations,
      prComment: raw.prComment,
      fix: raw.fix,
      yes: raw.yes,
      color,
      full: raw.full,
      projects,
      diff,
      staged: raw.staged,
      failOn: raw.failOn,
      explain,
      why,
    };

    // RULE-028: reject contradictory combos as a PARSER error (same message as legacy).
    try {
      validateModeFlags({ ...flags, directory: "." });
    } catch (e) {
      return yield* Effect.fail(
        ValidationError.invalidValue(
          HelpDoc.p(e instanceof FlagError ? e.message : String(e)),
        ),
      );
    }

    return flags;
  });

/**
 * The PRODUCTION IO seam: `Terminal`-backed stdout/stderr + the Node runnables of the
 * engine + fix-applier slices + the global rule catalog. Built inside an Effect because
 * `stdout`/`stderr` need the `Terminal` service from context.
 */
const makeRealIo = (terminal: Terminal.Terminal): InspectIo => {
  // A `Rule`/`GraphRule` is `RuleMeta & { create }`, so each registry entry IS a
  // structural `RuleMeta` — keyed by `id`. Include both per-file and graph rules so
  // `--explain <graph-rule>` resolves.
  const ruleCatalog: Record<string, RuleMeta> = Object.fromEntries(
    [...ruleRegistry, ...graphRuleRegistry].map((r): [string, RuleMeta] => [r.id, r]),
  );
  return {
    // `terminal.display` may fail with a `PlatformError`; a Terminal-write failure is
    // unexpected/fatal, so `orDie` it to satisfy the `Effect<void>` (never-error) seam.
    stdout: (text) => terminal.display(text).pipe(Effect.orDie),
    // `@effect/cli`'s `Terminal` has one `display` sink; stderr content is routed there
    // too (the `--fix` summary). The process edge keeps real stdout/stderr separation
    // for piping; tests assert on the captured text regardless of channel.
    stderr: (text) => terminal.display(text).pipe(Effect.orDie),
    // `diagnoseWorkspaceNode` CAN reject (e.g. `TsconfigNotFoundError` on a dir that is
    // neither a TS project nor a workspace), and `InspectIo.analyze` declares a typed error
    // channel for exactly that. Use `tryPromise` (NOT `promise`) so the rejection lands in
    // the ERROR channel — a `promise` would route it to the DIE channel, where `bin.ts`'s
    // `Cause.failureOption` misses it and falls back to the raw `Cause.pretty` dump
    // (`(FiberFailure) …` + an internal stack frame). `catch: (e) => e` passes the original
    // `Error` through unchanged so the process edge prints its clean `.message` (a bare
    // `tryPromise` would wrap it in `UnknownException` and lose the message).
    analyze: (directory, options) =>
      Effect.tryPromise({
        try: () => diagnoseWorkspaceNode(directory, options),
        catch: (e) => e,
      }),
    applyFixes: (diagnostics, rootDir) =>
      Effect.promise(() => applyFixesToFilesNode(diagnostics, rootDir)),
    ruleCatalog,
  };
};

/**
 * The `inspect` command. The handler resolves flags (RULE-028 already enforced at parse
 * time), threads in the positional `directory`, builds the real IO seam, runs
 * {@link runInspect}, and sets the resolved exit code on the process. Errors from the
 * engine (tagged discovery failures) propagate to the process edge → exit 1.
 */
export const inspectCommand = Command.make(
  "inspect",
  { directory: directoryArg, options: rawOptions },
  ({ directory, options }) =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      // RULE-028 / malformed-`--explain` rejections (resolveInspectFlags → ValidationError)
      // are HANDLER-phase: `@effect/cli` only auto-renders PARSE-phase errors, so a raw
      // failure here would reach `bin.ts` and dump the cause as JSON. Catch it and emit the
      // SAME terse `tsnuke: <message>` line the process edge uses for every other error
      // (the ValidationError carries its message as a `HelpDoc`). Parser-phase errors
      // (unknown flag, --deep/--no-deep, bad --format) are still rendered by the library.
      const resolved = yield* Effect.either(resolveInspectFlags(options));
      if (Either.isLeft(resolved)) {
        yield* terminal
          .display(`tsnuke: ${HelpDoc.toAnsiText(resolved.left.error).trim()}\n`)
          .pipe(Effect.orDie);
        process.exitCode = 1;
        return;
      }
      const flags: InspectFlags = { ...resolved.right, directory };
      const rulesChecked = ruleRegistry.length + graphRuleRegistry.length;
      const code = yield* runInspect(flags, makeRealIo(terminal), VERSION, rulesChecked);
      // The process edge reads `process.exitCode`; set it here for the success path.
      // (Engine failures bypass this and are mapped to 1 at `bin.ts`.)
      process.exitCode = code;
    }),
).pipe(Command.withDescription("Inspect a TypeScript project's health (the default command)."));

/** Package version string for the `--version` banner and the `--json` report's `version`
 * field. The esbuild bundle replaces `process.env.TSNUKE_VERSION` with the real
 * `package.json` version at build time (see `build.ts`); source-mode and tests fall back
 * to "0.0.0" (the legacy pinned value the equivalence tests pass explicitly). */
export const VERSION = process.env.TSNUKE_VERSION ?? "0.0.0";
