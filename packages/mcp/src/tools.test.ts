import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { diagnoseTool, explainTool, listRulesTool } from "./tools.js";

// A tiny on-disk fixture project with one obvious violation (an `any`).
const root = mkdtempSync(resolve(tmpdir(), "ts-doctor-mcp-"));
mkdirSync(resolve(root, "src"), { recursive: true });
writeFileSync(resolve(root, "tsconfig.json"), '{ "compilerOptions": { "strict": true } }\n');
writeFileSync(resolve(root, "package.json"), '{ "name": "fix", "version": "1.0.0" }\n');
writeFileSync(resolve(root, "src/x.ts"), "export const v: any = 1;\n");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("mcp tools", () => {
  it("diagnoseTool returns a summary + agent report with the firing rule", async () => {
    const out = await diagnoseTool({ directory: root });
    expect(out.summary).toContain("Score");
    expect(out.report.ruleCount).toBeGreaterThanOrEqual(1);
    const allRules = out.report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(allRules).toContain("no-explicit-any");
  });

  it("explainTool renders an offline explanation for a known rule", () => {
    const text = explainTool({ rule: "no-floating-promises" });
    expect(text).toContain("no-floating-promises");
    expect(text).toContain("[TYP]");
    expect(text).toContain("Recommendation:");
  });

  it("explainTool reports unknown rules gracefully", () => {
    expect(explainTool({ rule: "does-not-exist" })).toContain("Unknown rule");
  });

  it("listRulesTool returns the catalog including a GRAPH rule", () => {
    const rules = listRulesTool();
    expect(rules.length).toBeGreaterThan(50);
    expect(rules.some((r) => r.id === "no-import-cycles" && r.tier === "GRAPH")).toBe(true);
    // sorted by id
    const ids = rules.map((r) => r.id);
    expect([...ids].sort()).toEqual(ids);
  });
});
