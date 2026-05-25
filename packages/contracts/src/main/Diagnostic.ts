/**
 * The CANONICAL diagnostic domain contract, as `effect/Schema` (Modernization Brief
 * line 94 — the wire/domain contract is a Schema, not a hand-rolled type).
 *
 * This is the single source of truth for `Severity` / `Tier` / `FixKind` / `TextEdit`
 * / `Fix` / `Diagnostic`, consolidating the IDENTICAL copies that the `score`,
 * `filter-pipeline`, and `build-report` slices each vendor today (the cross-cutting
 * drift the architecture-critic flagged as the highest-value follow-up). It mirrors
 * the legacy `@tsnuke/rules` types (`packages/tsnuke-rules/src/types.ts`) and is
 * a faithful structural SUPERSET of every vendored copy — proven in
 * `src/test/Diagnostic.compat.test.ts`, so de-vendoring those slices later is safe.
 *
 * Modeling these as Schemas (not bare interfaces) gives callers a single runtime
 * `Schema.decode` gate for untrusted diagnostics — but the consuming slices do NOT
 * decode on the hot path; they accept already-typed values (kept pure & fast, per the
 * architecture-critic caveat in the brief). These are PURE contracts: no Effect monad.
 *
 * NOT modeled here (owned elsewhere, by design — see TRANSFORMATION_NOTES.md):
 *   - `DiagnosticWithTags` (the engine-only `tags` INPUT carry) stays in filter-pipeline;
 *     the canonical `Diagnostic` is the PUBLIC shape (tags stripped before emit, RULE-023).
 *   - `ModuleGraph` (GRAPH-tier input, not duplicated across slices).
 */

import { Schema } from "effect";

/**
 * Diagnostic severity — the ENGINE vocabulary. tsnuke v1 has no `info` level
 * (RULE-031). Identical across all five vendored copies (score/filter-pipeline/
 * build-report/capabilities and legacy `tsnuke-rules`). Distinct on purpose from
 * the config-file vocabulary `ConfigSeverity` (`Config.ts`, `error`/`warn`/`off`) and
 * from `FailOn` — the `warn` vs `warning` split is preserved deliberately (RULE-040).
 */
export const Severity = Schema.Literal("error", "warning").annotations({
  identifier: "Severity",
});
export type Severity = typeof Severity.Type;

/**
 * The analysis tier that produced a diagnostic (BC-10).
 * - `SYN`: syntactic, AST-only (always available)
 * - `TYP`: type-aware, requires `typecheck:ok` + the `ts.TypeChecker`
 * - `GRAPH`: module-graph rules (cycles, unused exports)
 * - `CFG`: project-level config rules (tsconfig strictness gaps)
 */
export const Tier = Schema.Literal("SYN", "TYP", "GRAPH", "CFG").annotations({
  identifier: "Tier",
});
export type Tier = typeof Tier.Type;

/** How a diagnostic can be remediated (RULE-032). */
export const FixKind = Schema.Literal("auto-fix", "codemod", "manual").annotations({
  identifier: "FixKind",
});
export type FixKind = typeof FixKind.Type;

/** A single text replacement over a source file, by half-open `[start, end)` char offsets. */
export const TextEdit = Schema.Struct({
  /** Inclusive start char offset into the source file. */
  start: Schema.Int.annotations({
    description: "Inclusive start char offset into the source file.",
  }),
  /** Exclusive end char offset into the source file. */
  end: Schema.Int.annotations({
    description: "Exclusive end char offset into the source file.",
  }),
  /** Text to splice in over `[start, end)`. */
  replacement: Schema.String.annotations({
    description: "Text to splice in over `[start, end)`.",
  }),
}).annotations({ identifier: "TextEdit" });
export type TextEdit = typeof TextEdit.Type;

/** A structured, machine-applicable remediation (BC-14). */
export const Fix = Schema.Struct({
  kind: FixKind,
  edits: Schema.Array(TextEdit),
  /** TYP rules only: the type the checker inferred at the fix site. */
  inferredType: Schema.optional(
    Schema.String.annotations({
      description: "TYP rules only: the type the checker inferred at the fix site.",
    }),
  ),
}).annotations({ identifier: "Fix" });
export type Fix = typeof Fix.Type;

/**
 * One finding emitted by a rule (the full legacy `Diagnostic`, all fields). Carries
 * deterministic identity inputs + a tier tag (BC-10/BC-13). Different consumers read
 * different projections — score reads `plugin`/`rule`/`severity` (RULE-001),
 * build-report reads `severity`/`filePath` (RULE-004), filter-pipeline reads
 * `tags`/`plugin`/`rule`/`severity`/`category`/`filePath`/`line` (RULE-023/040) — but
 * the CONTRACT is one shape, owned here.
 */
export const Diagnostic = Schema.Struct({
  filePath: Schema.String,
  /** Always `"tsnuke"` in v1 (first-party catalog only). */
  plugin: Schema.String.annotations({
    description: 'Always `"tsnuke"` in v1 (first-party catalog only).',
  }),
  /** The rule id that produced this diagnostic. */
  rule: Schema.String.annotations({
    description: "The rule id that produced this diagnostic.",
  }),
  severity: Severity,
  message: Schema.String,
  help: Schema.String,
  /** Optional docs link for this rule. */
  url: Schema.optional(
    Schema.String.annotations({ description: "Optional docs link for this rule." }),
  ),
  /** 1-based line. `<= 0` is exempt from inline-disable matching (RULE-023 Stage 4). */
  line: Schema.Int.annotations({
    description:
      "1-based line. `<= 0` is exempt from inline-disable matching (RULE-023 Stage 4).",
  }),
  /** 1-based column. */
  column: Schema.Int.annotations({ description: "1-based column." }),
  category: Schema.String,
  tier: Tier,
  fix: Schema.optional(Fix),
  /** Set when a near-miss inline-disable directive was found (BC-12). */
  suppressionHint: Schema.optional(
    Schema.String.annotations({
      description: "Set when a near-miss inline-disable directive was found (BC-12).",
    }),
  ),
}).annotations({ identifier: "Diagnostic" });
export type Diagnostic = typeof Diagnostic.Type;

/**
 * Decode an untrusted value into a {@link Diagnostic}, returning `Either` (not
 * throwing). The trust-boundary gate for diagnostics coming from outside the type
 * system. Consuming slices do NOT call this on the hot path (pure & fast).
 */
export const decodeDiagnostic = Schema.decodeUnknownEither(Diagnostic);
