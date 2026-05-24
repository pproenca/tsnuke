/**
 * The diagnostic filter pipeline (C6, BC-11).
 *
 * Four ORDERED stages, each a `Diagnostic | null` transform — order is
 * load-bearing and tested:
 *
 *   1. auto-suppress       — drop diagnostics tagged as known test-noise
 *   2. severity override   — remap per config.rules / config.categories; "off" drops
 *   3. ignore              — drop by ignore.rules / ignore.files / ignore.overrides
 *   4. inline-disable      — honor `// ts-doctor-disable-next-line <rule>` directives
 *
 * A diagnostic dropped by an earlier stage NEVER reaches a later one — e.g. a
 * diagnostic turned "off" at stage 2 is gone before the ignore stage runs.
 *
 * See REIMAGINED_ARCHITECTURE.md §4.1 / AI_NATIVE_SPEC.md §5 (BC-11/BC-12).
 */

import type { Diagnostic, Severity } from "@ts-doctor/rules";
import type { TsDoctorConfig } from "./types.js";

/** Tags whose diagnostics are auto-suppressed as known noise (stage 1). */
const AUTO_SUPPRESS_TAGS: ReadonlySet<string> = new Set(["test-noise"]);

/** Optional per-diagnostic carry of the originating rule's tags (for stage 1). */
export interface DiagnosticWithTags extends Diagnostic {
  /** Tags from the rule meta, used only by the auto-suppress stage. */
  tags?: readonly string[];
}

/** Source text for files, keyed by absolute path — needed by the inline-disable stage. */
export type SourceTextMap = ReadonlyMap<string, string>;

/** Options controlling pipeline behavior. */
export interface FilterPipelineOptions {
  /** Honor inline-disable directives (stage 4). Default true. */
  respectInlineDisables?: boolean;
  /** File text by absolute path, for the inline-disable stage. */
  sources?: SourceTextMap;
}

/** A single stage: returns the (possibly remapped) diagnostic, or null to drop it. */
type Stage = (d: DiagnosticWithTags) => DiagnosticWithTags | null;

function normalizeSeverity(
  value: "error" | "warn" | "off",
): Severity | "off" {
  if (value === "off") return "off";
  return value === "warn" ? "warning" : "error";
}

/** Stage 1 — drop diagnostics whose rule is tagged as known test-noise. */
function stageAutoSuppress(d: DiagnosticWithTags): DiagnosticWithTags | null {
  if (d.tags) {
    for (const tag of d.tags) {
      if (AUTO_SUPPRESS_TAGS.has(tag)) return null;
    }
  }
  return d;
}

/** Stage 2 — apply config.rules / config.categories severity overrides; "off" drops. */
function makeSeverityStage(config: TsDoctorConfig): Stage {
  const ruleOverrides = config.rules ?? {};
  const categoryOverrides = config.categories ?? {};
  return (d) => {
    // Rule override takes precedence over category override.
    const ruleOv = ruleOverrides[d.rule] ?? ruleOverrides[`${d.plugin}/${d.rule}`];
    if (ruleOv !== undefined) {
      const sev = normalizeSeverity(ruleOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    const catOv = categoryOverrides[d.category];
    if (catOv !== undefined) {
      const sev = normalizeSeverity(catOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    return d;
  };
}

/** Match a file path against an ignore entry (suffix / substring / exact). */
function fileMatches(filePath: string, pattern: string): boolean {
  if (filePath === pattern) return true;
  if (filePath.endsWith(pattern)) return true;
  if (filePath.includes(pattern)) return true;
  return false;
}

/** Stage 3 — drop by ignore.rules / ignore.files / ignore.overrides. */
function makeIgnoreStage(config: TsDoctorConfig): Stage {
  const ignore = config.ignore ?? {};
  const ignoredRules = new Set(ignore.rules ?? []);
  const ignoredFiles = ignore.files ?? [];
  const overrides = ignore.overrides ?? [];
  return (d) => {
    if (ignoredRules.has(d.rule) || ignoredRules.has(`${d.plugin}/${d.rule}`)) {
      return null;
    }
    for (const f of ignoredFiles) {
      if (fileMatches(d.filePath, f)) return null;
    }
    for (const ov of overrides) {
      const fileHit = ov.files.some((f) => fileMatches(d.filePath, f));
      if (!fileHit) continue;
      // overrides with rules: drop only those rules in those files;
      // overrides without rules: drop all diagnostics in those files.
      if (ov.rules === undefined) return null;
      if (ov.rules.includes(d.rule) || ov.rules.includes(`${d.plugin}/${d.rule}`)) {
        return null;
      }
    }
    return d;
  };
}

const DISABLE_NEXT_LINE_RE =
  /\/\/\s*ts-doctor-disable-next-line\s*(.*)$/;

/**
 * Build the set of (1-based line → rules-disabled) directives for a file.
 * `// ts-doctor-disable-next-line <rule>` disables `<rule>` on the *following*
 * line; with no rule listed it disables all rules on the next line.
 */
function parseInlineDisables(
  text: string,
): Map<number, { all: boolean; rules: Set<string> }> {
  const out = new Map<number, { all: boolean; rules: Set<string> }>();
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = line.match(DISABLE_NEXT_LINE_RE);
    if (!m) continue;
    const targetLine = i + 2; // 1-based, the NEXT line
    const rest = (m[1] ?? "").trim();
    const ruleNames = rest.length > 0 ? rest.split(/[\s,]+/).filter(Boolean) : [];
    out.set(targetLine, {
      all: ruleNames.length === 0,
      rules: new Set(ruleNames),
    });
  }
  return out;
}

/** Stage 4 — honor inline-disable directives (BC-11, BC-12). */
function makeInlineDisableStage(
  sources: SourceTextMap | undefined,
): Stage {
  // Lazily parse each file's directives once.
  const cache = new Map<string, Map<number, { all: boolean; rules: Set<string> }>>();
  const directivesFor = (
    filePath: string,
  ): Map<number, { all: boolean; rules: Set<string> }> => {
    const cached = cache.get(filePath);
    if (cached !== undefined) return cached;
    const text = sources?.get(filePath);
    const parsed =
      text !== undefined
        ? parseInlineDisables(text)
        : new Map<number, { all: boolean; rules: Set<string> }>();
    cache.set(filePath, parsed);
    return parsed;
  };

  return (d) => {
    if (d.line <= 0) return d; // line≤0 cannot be matched to a directive (BC-12)
    const directive = directivesFor(d.filePath).get(d.line);
    if (directive === undefined) return d;
    if (directive.all) return null;
    if (
      directive.rules.has(d.rule) ||
      directive.rules.has(`${d.plugin}/${d.rule}`)
    ) {
      return null;
    }
    return d;
  };
}

/**
 * Run the four ordered filter stages over `diagnostics` (BC-11).
 *
 * Stages run in fixed order; a diagnostic dropped by an earlier stage is never
 * seen by a later one. Inline-disable (stage 4) only runs when
 * `respectInlineDisables !== false` AND source text was supplied.
 */
export function runFilterPipeline(
  diagnostics: readonly DiagnosticWithTags[],
  config: TsDoctorConfig,
  options: FilterPipelineOptions = {},
): Diagnostic[] {
  const respectInline = options.respectInlineDisables !== false;

  const stages: Stage[] = [
    stageAutoSuppress, // 1
    makeSeverityStage(config), // 2
    makeIgnoreStage(config), // 3
  ];
  if (respectInline) {
    stages.push(makeInlineDisableStage(options.sources)); // 4
  }

  const out: Diagnostic[] = [];
  outer: for (const d of diagnostics) {
    let current: DiagnosticWithTags | null = d;
    for (const stage of stages) {
      current = stage(current);
      if (current === null) continue outer; // dropped — skip later stages
    }
    // Strip the engine-only `tags` field before emitting a public Diagnostic.
    const { tags: _tags, ...rest } = current;
    void _tags;
    out.push(rest);
  }
  return out;
}
