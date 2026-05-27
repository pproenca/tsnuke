/**
 * `buildAgentsMarkdown` — pure assembly of the AGENTS.md briefing.
 *
 * Pre-P2: this function generated an entire briefing (recipes, output format, exit
 * codes, full 98-row rule catalog) inline. Post-P2: the briefing IS the canonical
 * playbook (mirrored from `prompts/agent.md` via `playbook.const.ts`); this
 * function only wraps it in front-matter + appends a rule index + MCP hint.
 *
 * Tests cover the assembly contract — playbook inlined, front-matter present,
 * rule index grouped + sorted, determinism. The playbook CONTENT is asserted by
 * `playbook.sync.test.ts` against the source-of-truth `.md` file.
 */

import { describe, expect, it } from "vitest";
import type { RuleMeta } from "@tsnuke/contracts-effect";
import { buildAgentsMarkdown } from "../main/buildAgentsMarkdown.js";

const rule = (over: Partial<RuleMeta>): RuleMeta => ({
  id: "no-any",
  category: "type-safety",
  tier: "SYN",
  severity: "warning",
  fixKind: "manual",
  recommendation: "Replace `any` with a precise type.",
  ...over,
});

describe("buildAgentsMarkdown", () => {
  it("emits the AGENTS.md front-matter with name + triggers", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md.startsWith("---\nname: tsnuke\n")).toBe(true);
    expect(md).toContain("triggers:");
    expect(md).toContain("after editing one or more .ts/.tsx files");
    expect(md).toContain("when the user types '/tsnuke'");
  });

  it("inlines the canonical playbook content", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    // Sentinel phrases from the playbook itself — if the inlining ever drops, these fail.
    expect(md).toContain("# tsnuke — agent playbook");
    expect(md).toContain("npx -y tsnuke@latest --diff --format agent");
    expect(md).toContain("## The loop");
    expect(md).toContain("https://pproenca.dev/tsnuke/prompts/agent.md");
    expect(md).toContain("https://pproenca.dev/tsnuke/prompts/rules/$rule.md");
  });

  it("explains the new agent-JSON honesty fields", () => {
    // P1 honest scoring — agents must learn these field names to make sense of the
    // report (`scoreLabel: null` on partial; `partialReason` + `scoreBreakdown`).
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md).toContain("`scoreLabel`");
    expect(md).toContain("`partialReason`");
    expect(md).toContain("`scoreBreakdown`");
    expect(md).toContain("typecheck-failed");
  });

  it("documents exit codes 0 / 1 / 130", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md).toContain("## Exit codes");
    expect(md).toContain("`0`");
    expect(md).toContain("`1`");
    expect(md).toContain("`130`");
  });

  it("rule index groups by category and sorts by id within each group", () => {
    const rules = [
      rule({ id: "z-rule" }),
      rule({ id: "a-rule", category: "naming-idioms" }),
      rule({ id: "m-rule", tier: "TYP", fixKind: "auto-fix" }),
    ];
    const md = buildAgentsMarkdown({ rules });
    expect(md).toContain("## Rule index");
    expect(md).toContain("Total: 3 rules across 2 categories.");
    // categories alphabetised, rule ids alphabetised within
    const namingPos = md.indexOf("**naming-idioms**");
    const typesafetyPos = md.indexOf("**type-safety**");
    expect(namingPos).toBeGreaterThan(0);
    expect(typesafetyPos).toBeGreaterThan(namingPos);
    const mPos = md.indexOf("`m-rule`");
    const zPos = md.indexOf("`z-rule`");
    expect(mPos).toBeGreaterThan(0);
    expect(zPos).toBeGreaterThan(mPos);
  });

  it("is deterministic for the same input", () => {
    const rules = [rule({}), rule({ id: "no-var", category: "naming-idioms" })];
    expect(buildAgentsMarkdown({ rules })).toBe(buildAgentsMarkdown({ rules }));
  });

  it("includes the MCP setup section", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md).toContain("## MCP server");
    expect(md).toContain("tsnuke-mcp");
  });

  it("embeds version when provided", () => {
    expect(buildAgentsMarkdown({ rules: [rule({})], version: "0.4.0" })).toContain(
      "Bundled with tsnuke 0.4.0",
    );
  });

  it("accepts a playbook override (used by tests to isolate the assembly logic)", () => {
    const md = buildAgentsMarkdown({
      rules: [rule({})],
      playbook: "## STUB PLAYBOOK\n\nshort body.",
    });
    expect(md).toContain("STUB PLAYBOOK");
    expect(md).not.toContain("# tsnuke — agent playbook");
  });
});
