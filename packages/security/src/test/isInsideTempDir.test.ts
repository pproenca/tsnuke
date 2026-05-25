/**
 * Characterization tests for `isInsideTempDir` — BC-16 (Zip-Slip defense).
 *
 * When materializing staged file contents into a temp directory, a malicious
 * relative path (`../../etc/passwd`, an absolute path, …) must never escape the
 * temp dir. Resolves both paths (via `node:path`) and verifies the candidate
 * stays at or strictly inside `tempDir`. FROZEN verbatim.
 *
 * Returns:
 *   - false for an ABSOLUTE candidate (never "relative to" the temp dir)
 *   - false for any path resolving AT/ABOVE tempDir (`..` escape)
 *   - true  for the same dir (`.`) or a strictly-nested path
 *
 * DORMANT (RULE-027): no staged-file extraction path calls this yet.
 */

import { describe, expect, it } from "vitest";
import { isInsideTempDir } from "../main/index.js";

const tmp = "/tmp/tsnuke-XYZ";

describe("isInsideTempDir — BC-16 (allows same-dir and nested paths)", () => {
  it("allows a direct child file", () => {
    expect(isInsideTempDir(tmp, "a.ts")).toBe(true);
  });
  it("allows a deeply nested path", () => {
    expect(isInsideTempDir(tmp, "nested/dir/a.ts")).toBe(true);
  });
  it("allows a `./`-prefixed path (same-dir relative)", () => {
    expect(isInsideTempDir(tmp, "./a.ts")).toBe(true);
  });
  it("allows `.` resolving to the temp dir itself (same dir)", () => {
    expect(isInsideTempDir(tmp, ".")).toBe(true);
  });
  it("allows a path that traverses up then back inside (net: still inside)", () => {
    // a/../b resolves to <tmp>/b — strictly inside.
    expect(isInsideTempDir(tmp, "a/../b.ts")).toBe(true);
  });
});

describe("isInsideTempDir — BC-16 (rejects traversal escapes)", () => {
  it("rejects a single `..` escape", () => {
    expect(isInsideTempDir(tmp, "../escape.ts")).toBe(false);
  });
  it("rejects a multi-level `..` escape", () => {
    expect(isInsideTempDir(tmp, "../../etc/passwd")).toBe(false);
  });
  it("rejects a path that traverses up past the temp dir net", () => {
    expect(isInsideTempDir(tmp, "a/../../escape.ts")).toBe(false);
  });
  it("rejects a bare `..` resolving exactly to the parent", () => {
    expect(isInsideTempDir(tmp, "..")).toBe(false);
  });
});

describe("isInsideTempDir — BC-16 (rejects absolute candidates outright)", () => {
  it("rejects an absolute /etc/passwd", () => {
    expect(isInsideTempDir(tmp, "/etc/passwd")).toBe(false);
  });
  it("rejects an absolute path even when it is literally under tempDir", () => {
    // An absolute candidate is never treated as relative — rejected up-front,
    // regardless of where it points.
    expect(isInsideTempDir(tmp, `${tmp}/a.ts`)).toBe(false);
  });
});
