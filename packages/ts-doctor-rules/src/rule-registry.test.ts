import { describe, it, expect } from "vitest";
import { ruleRegistry } from "./rule-registry.generated.js";
import { presets, recommended } from "./presets.js";
import { runRule, runTypeAwareRule } from "./test-utils.js";
import type { Rule } from "./define-rule.js";

const byId = (id: string): Rule => {
  const r = ruleRegistry.find((x) => x.id === id);
  if (!r) throw new Error(`rule not found in registry: ${id}`);
  return r;
};

describe("rule registry — codegen output (C20)", () => {
  it("registers all scaffolded rules with unique ids", () => {
    const ids = ruleRegistry.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "no-ts-ignore",
        "no-non-null-assertion",
        "no-explicit-any",
        "enable-strict",
        "enable-no-unchecked-indexed-access",
        "no-floating-promises",
        "switch-exhaustiveness-check",
      ]),
    );
  });

  it("every rule carries required metadata (id/severity/tier/category)", () => {
    for (const r of ruleRegistry) {
      expect(r.id).toBeTruthy();
      expect(["error", "warning"]).toContain(r.severity);
      expect(["SYN", "TYP", "GRAPH", "CFG"]).toContain(r.tier);
      expect(r.category).toBeTruthy();
      expect(typeof r.create).toBe("function");
    }
  });
});

describe("BC-10 — tier tagging", () => {
  it("a real SYN rule emits diagnostics tagged tier:'SYN'", () => {
    const diags = runRule(byId("no-explicit-any"), "let x: any;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("CFG rules are registered with tier:'CFG' and don't walk the AST", () => {
    expect(byId("enable-strict").tier).toBe("CFG");
    // Project-level rules: no per-file findings even on code that 'looks' relevant.
    expect(runRule(byId("enable-strict"), "let x: any;\n")).toHaveLength(0);
  });

  it("TYP stub rules are registered with tier:'TYP' and currently emit nothing", () => {
    const floating = byId("no-floating-promises");
    const exhaustive = byId("switch-exhaustiveness-check");
    expect(floating.tier).toBe("TYP");
    expect(exhaustive.tier).toBe("TYP");
    // Gated on a clean type-check (BC-10) — only ever active under typecheck:ok.
    expect(floating.requires).toContain("typecheck:ok");
    expect(exhaustive.requires).toContain("typecheck:ok");
    // The seam: registered but the create() body is a no-op until Tier-2 lands.
    expect(runRule(floating, "Promise.resolve(1);\n")).toHaveLength(0);
    expect(
      runRule(exhaustive, "switch (1 as 1 | 2) { case 1: break; }\n"),
    ).toHaveLength(0);
  });

  it("BC-10/BC-03: Tier-2 — no-floating-promises fires under typecheck:ok with ts.Program + checker", () => {
    const diags = runTypeAwareRule(byId("no-floating-promises"), "Promise.resolve(1);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("BC-10/BC-03: Tier-2 — switch-exhaustiveness-check fires under typecheck:ok with ts.Program + checker", () => {
    const code = 'declare const c: "a" | "b";\nswitch (c) { case "a": break; }\n';
    const diags = runTypeAwareRule(byId("switch-exhaustiveness-check"), code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });
});

describe("presets — registry projection", () => {
  it("recommended includes every default-enabled rule", () => {
    const enabledIds = ruleRegistry
      .filter((r) => r.defaultEnabled !== false)
      .map((r) => r.id);
    expect(Object.keys(recommended.ruleSeverities).sort()).toEqual(enabledIds.sort());
  });

  it("exposes recommended by name", () => {
    expect(presets["recommended"]).toBe(recommended);
  });
});
