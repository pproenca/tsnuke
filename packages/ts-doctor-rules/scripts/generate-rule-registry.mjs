#!/usr/bin/env node
// @ts-check
/**
 * Rule-registry codegen (carried from react-doctor's mechanism — C20, BC).
 *
 * Convention: `src/rules/<category-slug>/<rule>.ts`, where the directory is the
 * category and each file exports `const rule = defineRule({...}, ...)`.
 *
 * This script:
 *   - scans `src/rules/<category>/*.ts` for files containing `defineRule(`
 *   - maps each directory slug to a KNOWN category display name
 *       (an unknown directory is a FATAL error — the "unknown bucket" guard)
 *   - validates each rule file declares `id`, `severity`, and `tier`
 *   - emits `src/rule-registry.generated.ts` re-exporting every rule as
 *       `ruleRegistry: Rule[]`, sorted deterministically (category, then id)
 *
 * `--check` mode: regenerate in-memory and FAIL (exit 1) if the committed file
 * is stale, if a rule lacks required metadata, or if a directory is an unknown
 * bucket. Run in CI / pre-commit so the generated file can never drift.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const RULES_DIR = join(PKG_ROOT, "src", "rules");
const OUT_FILE = join(PKG_ROOT, "src", "rule-registry.generated.ts");

/**
 * Known category buckets: directory slug -> display category name.
 * MUST stay in sync with the `category` field each rule declares and with the
 * taxonomy in AI_NATIVE_SPEC.md §2.3. A directory not in this map is fatal.
 */
const CATEGORY_BY_SLUG = {
  "type-safety": "Type Safety",
  "type-assertions": "Type Assertions & Escapes",
  async: "Async / Promises",
  exhaustiveness: "Exhaustiveness & Narrowing",
  strictness: "Compiler Strictness Gaps",
  "naming-idioms": "Naming & Idioms",
  "error-handling": "Error Handling",
  generics: "Generics & Type-Level Complexity",
  security: "Security",
  "module-boundaries": "Module Boundaries & Architecture",
  "declaration-api": "Declaration & API Hygiene",
  "type-performance": "Type Performance",
  "dead-code": "Dead Code & Unused Exports",
};

const isCheck = process.argv.includes("--check");

/** @param {string} msg */
function fail(msg) {
  console.error(`[generate-rule-registry] ${msg}`);
  process.exit(1);
}

/**
 * Discover rule files grouped by category slug.
 * @returns {{ slug: string, category: string, file: string, importPath: string, source: string }[]}
 */
function discoverRules() {
  if (!existsSync(RULES_DIR)) fail(`rules dir not found: ${RULES_DIR}`);

  /** @type {{ slug: string, category: string, file: string, importPath: string, source: string }[]} */
  const found = [];
  /** @type {{ slug: string, category: string, file: string, importPath: string, source: string }[]} */
  const graphFound = [];

  const slugs = readdirSync(RULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const slug of slugs) {
    const category = CATEGORY_BY_SLUG[slug];
    if (category === undefined) {
      // "unknown bucket = fatal" guard (carried from react-doctor).
      fail(
        `unknown category bucket: src/rules/${slug}/ — add it to CATEGORY_BY_SLUG or move the rule. Known: ${Object.keys(
          CATEGORY_BY_SLUG,
        ).join(", ")}`,
      );
    }

    const dir = join(RULES_DIR, slug);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
      .sort();

    for (const file of files) {
      const full = join(dir, file);
      const source = readFileSync(full, "utf8");
      const isGraph = source.includes("defineGraphRule(");
      const isRule = !isGraph && source.includes("defineRule(");
      if (!isGraph && !isRule) continue; // not a rule module

      const ruleName = basename(file, ".ts");
      validateRuleSource(source, `src/rules/${slug}/${file}`);

      const entry = {
        slug,
        category,
        file,
        importPath: `./rules/${slug}/${ruleName}.js`,
        source,
      };
      if (isGraph) graphFound.push(entry);
      else found.push(entry);
    }
  }

  return { rules: found, graphRules: graphFound };
}

/**
 * Lightweight static validation: a rule file must declare id, severity, tier.
 * (Source-text checks, not a TS parse — matches the legacy codegen's contract.)
 * @param {string} source
 * @param {string} rel
 */
function validateRuleSource(source, rel) {
  /** @type {string[]} */
  const missing = [];
  if (!/\bid\s*:/.test(source)) missing.push("id");
  if (!/\bseverity\s*:/.test(source)) missing.push("severity");
  if (!/\btier\s*:/.test(source)) missing.push("tier");
  if (missing.length > 0) {
    fail(`${rel} is missing required rule metadata: ${missing.join(", ")}`);
  }
}

/**
 * @param {{ slug: string, category: string, file: string, importPath: string }[]} rules
 * @param {{ slug: string, category: string, file: string, importPath: string }[]} graphRules
 * @returns {string}
 */
function render(rules, graphRules) {
  // Deterministic order: by category slug, then by rule file name.
  /** @param {{slug:string,file:string}[]} list */
  const sortList = (list) =>
    [...list].sort((a, b) => a.slug.localeCompare(b.slug) || a.file.localeCompare(b.file));
  const sorted = sortList(rules);
  const sortedGraph = sortList(graphRules);

  /** @param {string} f @param {string} suffix */
  const aliasOf = (f, suffix) =>
    basename(f, ".ts").replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")) + suffix;

  const imports = sorted
    .map((r) => `import { rule as ${aliasOf(r.file, "Rule")} } from "${r.importPath}";`)
    .join("\n");
  const graphImports = sortedGraph
    .map((r) => `import { rule as ${aliasOf(r.file, "GraphRule")} } from "${r.importPath}";`)
    .join("\n");

  const entries = sorted.map((r) => `  ${aliasOf(r.file, "Rule")},`).join("\n");
  const graphEntries = sortedGraph.map((r) => `  ${aliasOf(r.file, "GraphRule")},`).join("\n");

  return `// AUTO-GENERATED by scripts/generate-rule-registry.mjs — DO NOT EDIT.
// Run \`pnpm gen\` to regenerate; \`pnpm gen:check\` verifies it is up to date.
import type { GraphRule, Rule } from "./define-rule.js";
${imports}
${graphImports}

/** Every first-party per-file rule (SYN/TYP/CFG), in deterministic (category, id) order. */
export const ruleRegistry: Rule[] = [
${entries}
];

/** Every first-party GRAPH-tier rule (module-graph analysis). */
export const graphRuleRegistry: GraphRule[] = [
${graphEntries}
];
`;
}

function main() {
  const { rules, graphRules } = discoverRules();
  const next = render(rules, graphRules);
  const tally = `${rules.length} rules + ${graphRules.length} graph rules`;

  if (isCheck) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
    if (current !== next) {
      fail(
        `rule-registry.generated.ts is stale. Run \`pnpm gen\` and commit the result.`,
      );
    }
    console.log(`[generate-rule-registry] OK — ${tally}, registry up to date.`);
    return;
  }

  writeFileSync(OUT_FILE, next, "utf8");
  console.log(`[generate-rule-registry] wrote ${tally} -> ${OUT_FILE}`);
}

main();
