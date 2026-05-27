/**
 * `buildAgentsMarkdown` — pure assembly of the AGENTS.md briefing. Asserts the
 * shape (front-matter present, sections in order, rules table populated) and
 * determinism.
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
  });

  it("includes the recipe section + the agent JSON invocation", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md).toContain("## Recipes");
    expect(md).toContain("npx -y tsnuke --format agent");
    expect(md).toContain("npx -y tsnuke --fix --format agent");
  });

  it("documents exit codes 0 / 1 / 130", () => {
    const md = buildAgentsMarkdown({ rules: [rule({})] });
    expect(md).toContain("## Exit codes");
    expect(md).toContain("`0`");
    expect(md).toContain("`1`");
    expect(md).toContain("`130`");
  });

  it("populates the rule catalog table sorted by id", () => {
    const rules = [
      rule({ id: "z-rule" }),
      rule({ id: "a-rule", category: "naming-idioms" }),
      rule({ id: "m-rule", tier: "TYP", fixKind: "auto-fix" }),
    ];
    const md = buildAgentsMarkdown({ rules });
    expect(md).toContain("Total: 3 rules");
    const aPos = md.indexOf("| a-rule |");
    const mPos = md.indexOf("| m-rule |");
    const zPos = md.indexOf("| z-rule |");
    expect(aPos).toBeGreaterThan(0);
    expect(mPos).toBeGreaterThan(aPos);
    expect(zPos).toBeGreaterThan(mPos);
  });

  it("escapes `|` in recommendations to keep the markdown table intact", () => {
    const md = buildAgentsMarkdown({
      rules: [rule({ recommendation: "Use `A | B` not `any`." })],
    });
    expect(md).toContain("Use `A \\| B` not `any`.");
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
    expect(buildAgentsMarkdown({ rules: [rule({})], version: "0.4.0" })).toContain("tsnuke 0.4.0");
  });
});
