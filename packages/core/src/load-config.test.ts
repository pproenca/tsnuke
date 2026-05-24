import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./load-config.js";

describe("sanitizeConfig leniency (BC-22)", () => {
  it("non-object config → ignored, never throws, safe empty default", () => {
    expect(() => sanitizeConfig("garbage")).not.toThrow();
    expect(sanitizeConfig("garbage").config).toEqual({});
    expect(sanitizeConfig(42).config).toEqual({});
    expect(sanitizeConfig(null).config).toEqual({});
    expect(sanitizeConfig(["a", "b"]).config).toEqual({});
  });

  it("warns when the top-level value is not an object", () => {
    expect(sanitizeConfig("garbage").warnings.length).toBeGreaterThan(0);
  });

  it("drops invalid fields with a warning, keeps valid ones", () => {
    const { config, warnings } = sanitizeConfig({
      failOn: "explode", // invalid
      customRulesOnly: "yes", // invalid (not boolean)
      rules: { "good-rule": "warn", "bad-rule": "loud" }, // one valid, one not
      ignore: { rules: ["x"], files: 123 }, // files invalid
      categories: "nope", // invalid
      plugins: ["./evil.js"], // valid shape (kept for BC-18 to warn)
    });

    expect(config.failOn).toBeUndefined();
    expect(config.customRulesOnly).toBeUndefined();
    expect(config.rules).toEqual({ "good-rule": "warn" });
    expect(config.ignore?.rules).toEqual(["x"]);
    expect(config.ignore?.files).toBeUndefined();
    expect(config.categories).toBeUndefined();
    expect(config.plugins).toEqual(["./evil.js"]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("keeps a fully valid config intact", () => {
    const input = {
      failOn: "warning" as const,
      customRulesOnly: true,
      rules: { "no-any": "error" as const },
      categories: { "Type Safety": "warn" as const },
      ignore: {
        rules: ["r1"],
        files: ["dist/"],
        tags: ["test-noise"],
        overrides: [{ files: ["legacy/"], rules: ["no-any"] }],
      },
    };
    const { config, warnings } = sanitizeConfig(input);
    expect(config.failOn).toBe("warning");
    expect(config.customRulesOnly).toBe(true);
    expect(config.rules).toEqual({ "no-any": "error" });
    expect(config.ignore?.overrides).toEqual([
      { files: ["legacy/"], rules: ["no-any"] },
    ]);
    expect(warnings).toEqual([]);
  });
});
