import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-insecure-url.js";

describe("no-insecure-url (SYN)", () => {
  // --- Ported legacy vectors (the equivalence spec) -------------------------
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
    expect(runRule(rule, 'const u = "http://localhost:3000";\n')).toHaveLength(0);
  });

  // --- Added: shape / message / severity (warning) -------------------------
  it("emits the exact message, help, severity (warning) and position", () => {
    const diags = runRule(rule, 'const u = "http://example.com";\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Security");
    expect(d.tier).toBe("SYN");
    expect(d.message).toBe("Insecure `http://` URL; use `https://`.");
    expect(d.help).toBe(
      "Switch to `https://` so the request is encrypted in transit. Loopback hosts (localhost / 127.0.0.1) are exempt.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(11); // the string literal starts at the 11th char
  });

  // --- Added: loopback exemptions + anchoring + case-insensitivity ---------
  it("allows http://127.0.0.1", () => {
    expect(runRule(rule, 'const u = "http://127.0.0.1:8080";\n')).toHaveLength(0);
  });

  it("is case-insensitive on the scheme (HTTP://)", () => {
    expect(runRule(rule, 'const u = "HTTP://example.com";\n')).toHaveLength(1);
  });

  it("only matches an anchored scheme, not http:// embedded mid-string", () => {
    // INSECURE is anchored with ^, so a leading prefix means no match.
    expect(runRule(rule, 'const u = "see http://example.com";\n')).toHaveLength(
      0,
    );
  });

  it("does not flag a plain non-URL string", () => {
    expect(runRule(rule, 'const s = "hello world";\n')).toHaveLength(0);
  });

  it("flags loopback-prefixed-but-different host (localhostility) as it is not exempt", () => {
    // LOOPBACK matches the literal `localhost`; `localhost.evil.com` still starts
    // with `http://localhost`, so legacy treats it as exempt — assert that frozen
    // behavior rather than "improving" it.
    expect(
      runRule(rule, 'const u = "http://localhost.evil.com";\n'),
    ).toHaveLength(0);
  });
});
