/**
 * Characterization — the additive `RulesCore` self-barrel (opencode-ts module shape).
 *
 * The named re-exports stay the canonical surface the 14 consumers import; the
 * `export * as RulesCore from "."` namespace is ADDITIVE and must expose the SAME
 * bindings (identity-equal), never a divergent copy. This pins that invariant so a
 * future edit to the barrel can't silently drift the two surfaces apart.
 */

import { describe, expect, it } from "vitest";
import {
  RulesCore,
  createGraphRuleContext,
  createRuleContext,
  defineGraphRule,
  defineRule,
  diagnosticIdentity,
  PLUGIN_NAME,
  ruleRegistry,
  runGraphRule,
  runRule,
  runTypeAwareRule,
} from "../main/index.js";

describe("RulesCore self-barrel", () => {
  it("exposes the substrate functions identity-equal to the named exports", () => {
    expect(RulesCore.defineRule).toBe(defineRule);
    expect(RulesCore.defineGraphRule).toBe(defineGraphRule);
    expect(RulesCore.createRuleContext).toBe(createRuleContext);
    expect(RulesCore.createGraphRuleContext).toBe(createGraphRuleContext);
    expect(RulesCore.diagnosticIdentity).toBe(diagnosticIdentity);
    expect(RulesCore.PLUGIN_NAME).toBe(PLUGIN_NAME);
    expect(RulesCore.ruleRegistry).toBe(ruleRegistry);
    expect(RulesCore.runRule).toBe(runRule);
    expect(RulesCore.runTypeAwareRule).toBe(runTypeAwareRule);
    expect(RulesCore.runGraphRule).toBe(runGraphRule);
  });
});
