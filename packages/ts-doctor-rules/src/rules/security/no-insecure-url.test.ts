import { describe, expect, it } from "vitest";
import { rule } from "./no-insecure-url.js";
import { runRule } from "../../test-utils.js";

describe("no-insecure-url (SYN)", () => {
  it("flags an insecure http:// URL in a string literal", () => {
    const diags = runRule(rule, 'const u = "http://example.com";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-insecure-url");
  });

  it("flags an insecure http:// URL in a template literal", () => {
    expect(runRule(rule, "const u = `http://example.com`;\n")).toHaveLength(1);
  });

  it("allows an https:// URL", () => {
    expect(runRule(rule, 'const u = "https://example.com";\n')).toHaveLength(0);
  });

  it("allows http://localhost", () => {
    expect(runRule(rule, 'const u = "http://localhost:3000";\n')).toHaveLength(
      0,
    );
  });
});
