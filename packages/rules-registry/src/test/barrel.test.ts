/**
 * Characterization — the additive `RulesRegistry` self-barrel namespace.
 *
 * The named exports (`ruleRegistry` / `graphRuleRegistry` / `totalRuleCount`) stay the
 * canonical surface the engine imports; the `export * as RulesRegistry from "."` namespace
 * is ADDITIVE and must expose the SAME bindings (identity-equal). This pins that invariant.
 */

import { describe, expect, it } from "vitest";
import {
  RulesRegistry,
  graphRuleRegistry,
  ruleRegistry,
  totalRuleCount,
} from "../main/index.js";

describe("RulesRegistry self-barrel", () => {
  it("exposes the registries identity-equal to the named exports", () => {
    expect(RulesRegistry.ruleRegistry).toBe(ruleRegistry);
    expect(RulesRegistry.graphRuleRegistry).toBe(graphRuleRegistry);
    expect(RulesRegistry.totalRuleCount).toBe(totalRuleCount);
  });
});
