import { describe, it, expect } from "vitest";
import { shouldActivate, resolveSeverity } from "./capabilities.js";
import type { Capability, RuleMeta } from "./types.js";
import { rule as enableNoUnchecked } from "./rules/strictness/enable-no-unchecked-indexed-access.js";

const NO_TAGS: ReadonlySet<string> = new Set();

function caps(...tokens: Capability[]): ReadonlySet<Capability> {
  return new Set(tokens);
}

function meta(overrides: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id: "fixture-rule",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    ...overrides,
  };
}

describe("BC-08 — rule activation predicate", () => {
  it("requires ALL: activates only when every required token is present", () => {
    const r = meta({ requires: ["ts:5.8", "strict"] });
    expect(shouldActivate(r, caps("ts:5.8", "strict"), NO_TAGS)).toBe(true);
    // missing one required token -> not activated
    expect(shouldActivate(r, caps("ts:5.8"), NO_TAGS)).toBe(false);
    expect(shouldActivate(r, caps(), NO_TAGS)).toBe(false);
  });

  it("disabledBy ANY: any present disabling token deactivates", () => {
    const r = meta({ disabledBy: ["legacy", "lib"] });
    expect(shouldActivate(r, caps(), NO_TAGS)).toBe(true);
    expect(shouldActivate(r, caps("legacy"), NO_TAGS)).toBe(false);
    expect(shouldActivate(r, caps("lib"), NO_TAGS)).toBe(false);
  });

  it("ignored tags: any overlapping tag deactivates", () => {
    const r = meta({ tags: ["escape-hatch", "type-safety"] });
    expect(shouldActivate(r, caps(), NO_TAGS)).toBe(true);
    expect(shouldActivate(r, caps(), new Set(["escape-hatch"]))).toBe(false);
    expect(shouldActivate(r, caps(), new Set(["unrelated"]))).toBe(true);
  });

  it("defaultEnabled:false rules need an explicit severity to turn on", () => {
    const r = meta({ defaultEnabled: false });
    expect(shouldActivate(r, caps(), NO_TAGS)).toBe(false);
    expect(shouldActivate(r, caps(), NO_TAGS, "warning")).toBe(true);
    expect(shouldActivate(r, caps(), NO_TAGS, "error")).toBe(true);
  });

  it("explicit off: always deactivates, even for a default-on rule", () => {
    const r = meta();
    expect(shouldActivate(r, caps(), NO_TAGS)).toBe(true);
    expect(shouldActivate(r, caps(), NO_TAGS, "off")).toBe(false);
  });

  it("resolveSeverity: override wins, off -> null, default otherwise", () => {
    const r = meta({ severity: "warning" });
    expect(resolveSeverity(r)).toBe("warning");
    expect(resolveSeverity(r, "error")).toBe("error");
    expect(resolveSeverity(r, "off")).toBeNull();
  });
});

describe("BC-09 — inverted strictness gating", () => {
  it("enable-no-unchecked-indexed-access activates when the token is ABSENT", () => {
    // tsconfig present, but the flag is OFF (token not in the set) -> rule fires.
    expect(shouldActivate(enableNoUnchecked, caps("tsconfig"), NO_TAGS)).toBe(true);
  });

  it("self-disables when the flag is already ON (token present)", () => {
    expect(
      shouldActivate(
        enableNoUnchecked,
        caps("tsconfig", "noUncheckedIndexedAccess"),
        NO_TAGS,
      ),
    ).toBe(false);
  });

  it("does not activate without a tsconfig at all (requires unmet)", () => {
    expect(shouldActivate(enableNoUnchecked, caps(), NO_TAGS)).toBe(false);
  });
});
