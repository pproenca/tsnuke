/**
 * Project-local false-positive loader (P5).
 *
 * Reads `.tsnuke/false-positives.md` at the project root and parses it into the
 * same `FrameworkSuppression` shape the built-in catalog uses. Total — a missing
 * file, an unreadable file, an unparseable file all yield an empty list. The
 * file lives in user-owned space; we MUST NOT crash the engine on bad input.
 *
 * Format (mirror of react-doctor's `.react-doctor/false-positives.md`):
 *
 * ```
 * # Project-local tsnuke false positives.
 * # One entry per line: `<rule-id>: <file-glob>`. Comments start with `#`.
 *
 * no-default-export: src/pages/**\/*.tsx  # Next.js Pages Router
 * no-non-null-assertion: **\/*.test.ts    # canonical test idiom
 * no-unused-exports: src/public-api.ts    # exported for external consumers
 * ```
 *
 * Globs support the same small subset as the built-in catalog (`**`, `*`,
 * `{a,b,c}` alternation). Per-rule comments (after `#`) are preserved as the
 * suppression's `reason` so an agent reading the report can see WHY a
 * diagnostic was suppressed — auditable, not silent.
 */

import { Effect } from "effect";
import { FileSystem, Path } from "@effect/platform";

/** Shape mirrors `FrameworkSuppression` in `@tsnuke/filter-pipeline-effect`. */
export interface ProjectLocalSuppression {
  readonly rule: string;
  readonly fileGlob: string;
  readonly reason: string;
}

/**
 * Parse a `.tsnuke/false-positives.md` text into entries. Pure — no IO.
 * Returns an empty array on garbage input (no throws).
 *
 * Each non-comment line of the form `<rule>: <glob>[# <reason>]` becomes an
 * entry. Bare comment lines (`# ...`) and blank lines are skipped. Lines that
 * don't match the shape are skipped silently — user content is best-effort.
 */
export function parseFalsePositives(text: string): ProjectLocalSuppression[] {
  const out: ProjectLocalSuppression[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    // Split on `#` for inline comment / reason. The `:` is the rule/glob delimiter.
    const hashIdx = line.indexOf("#");
    const body = hashIdx === -1 ? line : line.slice(0, hashIdx).trim();
    const reason = hashIdx === -1 ? "project-local suppression" : line.slice(hashIdx + 1).trim();
    const colonIdx = body.indexOf(":");
    if (colonIdx === -1) continue;
    const rule = body.slice(0, colonIdx).trim();
    const fileGlob = body.slice(colonIdx + 1).trim();
    if (rule.length === 0 || fileGlob.length === 0) continue;
    out.push({ rule, fileGlob, reason: reason.length > 0 ? reason : "project-local suppression" });
  }
  return out;
}

/**
 * Load + parse `.tsnuke/false-positives.md` from the project root, as an
 * Effect over `@effect/platform` FileSystem + Path. Total — every IO error
 * (missing file, unreadable) maps to `[]`. Match the {@link loadConfig}
 * contract: NEVER fails the Effect.
 */
export const loadFalsePositives = (
  projectRoot: string,
): Effect.Effect<ReadonlyArray<ProjectLocalSuppression>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = path.join(projectRoot, ".tsnuke", "false-positives.md");
    const text = yield* fs
      .readFileString(filePath, "utf8")
      .pipe(Effect.orElseSucceed(() => undefined as string | undefined));
    if (text === undefined) return [];
    return parseFalsePositives(text);
  });
