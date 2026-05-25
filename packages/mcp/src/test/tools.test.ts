/**
 * The PURE handlers (`tools.ts`) against the REAL modern slices.
 *
 * `diagnoseTool` runs the production engine (`diagnoseNode`) over a real temp project on
 * disk (same pattern as engine-effect's `node.test.ts`) — proving the MCP server's
 * diagnose path projects the agent summary + report from a genuine run. `explainTool` /
 * `listRulesTool` are pure lookups over the real rule registry. Behavior is asserted
 * against the legacy `tools.ts` contract (summary text shape, report shape, catalog).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ruleRegistry, graphRuleRegistry } from "@ts-doctor/rules-registry-effect";
import { diagnoseTool, explainTool, listRulesTool } from "../main/tools.js";

const FULLY_STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

let cleanDir: string;
let dirtyDir: string;

beforeAll(() => {
  // A CLEAN project: fully-strict tsconfig + a no-violation source → score 100.
  cleanDir = mkdtempSync(join(tmpdir(), "tsd-mcp-clean-"));
  writeFileSync(join(cleanDir, "tsconfig.json"), FULLY_STRICT_TSCONFIG);
  mkdirSync(join(cleanDir, "src"));
  writeFileSync(
    join(cleanDir, "src", "index.ts"),
    "export const greet = (name: string): string => `hi ${name}`;\n",
  );

  // A DIRTY project: same tsconfig + a source with a SYN violation (no-explicit-any).
  dirtyDir = mkdtempSync(join(tmpdir(), "tsd-mcp-dirty-"));
  writeFileSync(join(dirtyDir, "tsconfig.json"), FULLY_STRICT_TSCONFIG);
  mkdirSync(join(dirtyDir, "src"));
  writeFileSync(
    join(dirtyDir, "src", "bad.ts"),
    "export function f(x: any): number {\n  return Number(x);\n}\n",
  );
});

afterAll(() => {
  rmSync(cleanDir, { recursive: true, force: true });
  rmSync(dirtyDir, { recursive: true, force: true });
});

describe("diagnoseTool — runs the real engine + projects the agent summary/report", () => {
  it("a clean project → score 100, no rules fired, summary headline", async () => {
    const out = await diagnoseTool({ directory: cleanDir });
    expect(out.report.score).toBe(100);
    expect(out.report.ruleCount).toBe(0);
    expect(out.report.occurrenceCount).toBe(0);
    expect(out.scorePartial).toBe(false);
    // Summary text shape is preserved VERBATIM from legacy.
    expect(out.summary).toBe(
      `Score 100/100 — 0 rule(s) fired across 0 occurrence(s) in ${cleanDir}.`,
    );
  });

  it("a project with a SYN violation → no-explicit-any in the report + score drops", async () => {
    const out = await diagnoseTool({ directory: dirtyDir });
    const firedRules = out.report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(firedRules).toContain("no-explicit-any");
    expect(out.report.ruleCount).toBeGreaterThanOrEqual(1);
    expect(out.report.score).not.toBeNull();
    expect(out.report.score).toBeLessThan(100);
    expect(out.summary).toContain("/100 —");
    expect(out.summary).toContain(`occurrence(s) in ${dirtyDir}.`);
  });

  it("respects the `deep` flag (forwarded to diagnoseNode without throwing)", async () => {
    const out = await diagnoseTool({ directory: cleanDir, deep: false });
    expect(out.report.score).not.toBeNull();
    expect(typeof out.scorePartial).toBe("boolean");
  });
});

describe("explainTool — offline, deterministic rule explanation", () => {
  it("returns the offline text for a known rule", () => {
    const out = explainTool({ rule: "no-explicit-any" });
    expect(out).toContain("no-explicit-any");
    expect(out).toContain("[SYN]");
    expect(out).not.toContain("Unknown rule");
  });

  it("is deterministic — identical output across calls", () => {
    expect(explainTool({ rule: "no-explicit-any" })).toBe(
      explainTool({ rule: "no-explicit-any" }),
    );
  });

  it("handles an unknown rule gracefully (inside explain, not a thrown gate)", () => {
    const out = explainTool({ rule: "does-not-exist-xyz" });
    expect(out).toContain("Unknown rule");
    expect(out).toContain("does-not-exist-xyz");
  });
});

describe("listRulesTool — the full catalog", () => {
  it("returns every rule in both registries, id-sorted", () => {
    const catalog = listRulesTool();
    expect(catalog.length).toBe(ruleRegistry.length + graphRuleRegistry.length);

    const ids = catalog.map((e) => e.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toStrictEqual(sorted);

    // Every entry carries the projected shape (id/category/tier/severity).
    for (const e of catalog) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.category).toBe("string");
      expect(["SYN", "TYP", "GRAPH", "CFG"]).toContain(e.tier);
      expect(["error", "warning"]).toContain(e.severity);
    }
  });

  it("includes both per-file and GRAPH rules (e.g. no-import-cycles)", () => {
    const ids = new Set(listRulesTool().map((e) => e.id));
    expect(ids.has("no-explicit-any")).toBe(true);
    expect(ids.has("no-import-cycles")).toBe(true);
  });
});
