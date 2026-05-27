/**
 * Framework-aware false-positive defaults (P5).
 *
 * The "rationale-reinvention tax" problem the maddie-native 2026-05-27 session
 * surfaced: agents burn time per-session rationalising the SAME suppressions
 * for the SAME framework conventions — Next.js routes need a default export,
 * `*.test.ts` files use `x!` as the canonical "must be defined" idiom, ops
 * scripts genuinely want imperative loops, etc. Each session re-invents the
 * justification; the next session re-invents it again.
 *
 * This module ships a static catalog of those well-known suppressions so the
 * filter pipeline drops them BEFORE the agent sees them. The catalog lives
 * in CODE (frozen, deterministic, equivalence-pinned) — not in user config.
 *
 * Each entry pairs a rule with a file-path pattern. The pattern syntax is a
 * small glob subset:
 *
 *   - `**` matches any number of path segments (incl. zero)
 *   - `*` matches one non-slash segment
 *   - `{a,b,c}` matches any of the alternatives
 *
 * Match semantics: the pattern is anchored against the END of the file path
 * (so `**\/page.tsx` matches `apps/web/src/app/page.tsx` and also bare
 * `page.tsx`). Pure synchronous string→regex compilation; no IO.
 */

/**
 * Compile a small-subset glob to a RegExp. Supports `**`, `*`, and
 * `{a,b,c}` alternations; everything else is literal. Anchored to match the
 * END of the path (so we don't have to know the project root).
 *
 * Returns `null` for malformed patterns (unmatched `{` etc.) so callers can
 * surface a clear "bad pattern" error instead of crashing.
 */
export function compileGlob(pattern: string): RegExp | null {
  let body = "";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i] ?? "";
    if (c === "*" && pattern[i + 1] === "*") {
      body += ".*";
      i += 2;
      // Skip a following slash so `**/foo` matches both `foo` and `bar/foo`.
      if (pattern[i] === "/") i += 1;
      continue;
    }
    if (c === "*") {
      body += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "{") {
      const close = pattern.indexOf("}", i);
      if (close === -1) return null;
      const alts = pattern.slice(i + 1, close).split(",");
      body += `(?:${alts.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
      i = close + 1;
      continue;
    }
    // Literal char — escape regex metacharacters.
    body += c === "/" ? "/" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  // Anchor to end of path (PATTERN matches suffix of filePath).
  return new RegExp(`(?:^|/)${body}$`);
}

/** A single framework-default suppression entry. */
export interface FrameworkSuppression {
  /** Rule ID (matches `Diagnostic.rule`). */
  readonly rule: string;
  /** File-path glob (small subset, see {@link compileGlob}). */
  readonly fileGlob: string;
  /** One-line rationale — surfaced to agents if the report includes suppressions. */
  readonly reason: string;
}

/**
 * The static framework-defaults catalog. Frozen — every entry needs a clear
 * documented rationale tying it to a real framework convention agents will
 * encounter. This is NOT a user-extensible list (use `.tsnuke/false-positives.md`
 * or `config.ignore.overrides` for project-local additions).
 *
 * Entries are sourced from the maddie-native 2026-05-27 session: every rule
 * the agent rationalised away as "framework needs this" is captured here so
 * future sessions don't repeat that work.
 */
export const FRAMEWORK_SUPPRESSIONS: ReadonlyArray<FrameworkSuppression> = [
  // ── Next.js App Router conventions ───────────────────────────────────────
  // The framework imports these files by path; the export shape (default fn)
  // and the function-without-explicit-return-type are the framework contract.
  { rule: "no-default-export", fileGlob: "**/page.{ts,tsx}", reason: "Next.js App Router pages must default-export the component" },
  { rule: "no-default-export", fileGlob: "**/layout.{ts,tsx}", reason: "Next.js layouts must default-export" },
  { rule: "no-default-export", fileGlob: "**/loading.{ts,tsx}", reason: "Next.js loading UI must default-export" },
  { rule: "no-default-export", fileGlob: "**/error.{ts,tsx}", reason: "Next.js error UI must default-export" },
  { rule: "no-default-export", fileGlob: "**/not-found.{ts,tsx}", reason: "Next.js not-found UI must default-export" },
  { rule: "no-default-export", fileGlob: "**/global-error.{ts,tsx}", reason: "Next.js global error must default-export" },
  { rule: "no-default-export", fileGlob: "**/template.{ts,tsx}", reason: "Next.js templates must default-export" },
  { rule: "no-default-export", fileGlob: "**/instrumentation.{ts,tsx}", reason: "Next.js instrumentation hooks default-export" },
  // route.ts uses NAMED exports for HTTP method handlers (GET/POST/...) — so
  // `no-default-export` doesn't fire there normally. We DO suppress
  // `no-unused-exports` since the framework loads them by name, not by graph.
  { rule: "no-unused-exports", fileGlob: "**/route.{ts,tsx}", reason: "Next.js loads route handlers (GET/POST/...) by name; no static import edge" },
  { rule: "no-unused-exports", fileGlob: "**/page.{ts,tsx}", reason: "Next.js loads pages by file path; no static import edge" },
  { rule: "no-unused-exports", fileGlob: "**/layout.{ts,tsx}", reason: "Next.js loads layouts by file path" },
  { rule: "no-unused-exports", fileGlob: "**/middleware.{ts,tsx}", reason: "Next.js loads middleware by file path" },
  { rule: "no-unused-exports", fileGlob: "**/instrumentation.{ts,tsx}", reason: "Next.js loads instrumentation by file path" },

  // ── Next.js Pages Router ─────────────────────────────────────────────────
  { rule: "no-default-export", fileGlob: "**/pages/**/*.{ts,tsx}", reason: "Next.js Pages Router pages must default-export the component" },
  { rule: "no-unused-exports", fileGlob: "**/pages/**/*.{ts,tsx}", reason: "Next.js loads pages by file path" },

  // ── Storybook ────────────────────────────────────────────────────────────
  { rule: "no-default-export", fileGlob: "**/*.stories.{ts,tsx}", reason: "Storybook stories default-export the meta object" },
  { rule: "no-unused-exports", fileGlob: "**/*.stories.{ts,tsx}", reason: "Storybook loads stories by file pattern" },

  // ── Test files ───────────────────────────────────────────────────────────
  // `x!` as "must be defined or this test should crash loudly" is canonical
  // in test code; replacing with `expect(x).toBeDefined()` adds ceremony
  // without safety gain (the test fails either way).
  { rule: "no-non-null-assertion", fileGlob: "**/*.test.{ts,tsx}", reason: "Tests: `x!` is the canonical 'must be defined' assertion" },
  { rule: "no-non-null-assertion", fileGlob: "**/*.spec.{ts,tsx}", reason: "Tests: `x!` is the canonical 'must be defined' assertion" },
  { rule: "no-non-null-assertion", fileGlob: "**/__tests__/**", reason: "Tests: `x!` is the canonical 'must be defined' assertion" },
  // Test fixtures often use object assertions for partial mocks.
  { rule: "no-unsafe-object-assertion", fileGlob: "**/*.test.{ts,tsx}", reason: "Test fixtures: partial mocks intentionally lie about shape" },
  { rule: "no-unsafe-object-assertion", fileGlob: "**/*.spec.{ts,tsx}", reason: "Test fixtures: partial mocks intentionally lie about shape" },
  // Test files often need `async` even when no `await` (mocking real async APIs).
  { rule: "require-await", fileGlob: "**/*.test.{ts,tsx}", reason: "Test mocks/setup are async-by-contract to mirror real APIs" },
  { rule: "require-await", fileGlob: "**/*.spec.{ts,tsx}", reason: "Test mocks/setup are async-by-contract to mirror real APIs" },

  // ── Vite / Vitest config files ───────────────────────────────────────────
  { rule: "no-default-export", fileGlob: "**/vite.config.{ts,js}", reason: "Vite config default-exports the config object" },
  { rule: "no-default-export", fileGlob: "**/vitest.config.{ts,js}", reason: "Vitest config default-exports the config object" },
  { rule: "no-default-export", fileGlob: "**/playwright.config.{ts,js}", reason: "Playwright config default-exports the config object" },

  // ── Public-API barrel files ──────────────────────────────────────────────
  // index.ts files exist to define the package's public surface; their
  // exports are consumed by package consumers tsnuke can't see in-graph.
  { rule: "no-unused-exports", fileGlob: "**/index.{ts,tsx}", reason: "Barrel files define public surface; consumers may be outside the analyzed graph" },
];

/** Pre-compile the catalog once at module load; reused per filter run. */
interface CompiledSuppression {
  readonly rule: string;
  readonly regex: RegExp;
  readonly reason: string;
}

let compiledCache: ReadonlyArray<CompiledSuppression> | null = null;

/** Lazy-compile the static catalog (called by the stage builder). */
export function getCompiledFrameworkSuppressions(): ReadonlyArray<CompiledSuppression> {
  if (compiledCache !== null) return compiledCache;
  compiledCache = FRAMEWORK_SUPPRESSIONS.flatMap((entry) => {
    const regex = compileGlob(entry.fileGlob);
    return regex === null ? [] : [{ rule: entry.rule, regex, reason: entry.reason }];
  });
  return compiledCache;
}

/**
 * Compile a list of additional suppressions (typically from a project-local
 * `.tsnuke/false-positives.md`) into the same compiled shape so the stage can
 * consume both without branching.
 */
export function compileSuppressions(
  entries: ReadonlyArray<FrameworkSuppression>,
): ReadonlyArray<CompiledSuppression> {
  return entries.flatMap((entry) => {
    const regex = compileGlob(entry.fileGlob);
    return regex === null ? [] : [{ rule: entry.rule, regex, reason: entry.reason }];
  });
}

/**
 * Build the framework-defaults stage. Drops a diagnostic when its `rule` and
 * `filePath` match any built-in or project-local suppression entry. The stage
 * runs after auto-suppress and before the user's severity overrides — so a
 * project that genuinely WANTS the rule enabled in a framework file can still
 * promote it via `config.rules.<rule>: "error"`. (Currently severity overrides
 * apply AFTER drops, so a framework-suppressed diagnostic is silently gone;
 * exposing override-resurrection is a follow-up.)
 */
export function makeFrameworkDefaultsStage(
  extra: ReadonlyArray<FrameworkSuppression> = [],
): (d: { rule: string; filePath: string }) => boolean {
  const compiled = [...getCompiledFrameworkSuppressions(), ...compileSuppressions(extra)];
  const byRule = new Map<string, RegExp[]>();
  for (const c of compiled) {
    const bucket = byRule.get(c.rule) ?? [];
    if (!byRule.has(c.rule)) byRule.set(c.rule, bucket);
    bucket.push(c.regex);
  }
  return (d) => {
    const patterns = byRule.get(d.rule);
    if (patterns === undefined) return true; // no suppressions for this rule → keep
    return !patterns.some((re) => re.test(d.filePath));
  };
}
