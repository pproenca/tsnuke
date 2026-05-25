/**
 * Characterization tests for `computeCapabilities` (`src/main/capabilities.ts`,
 * RULE-021). This is a PURE synchronous function (NOT Effect) — no Layer, no
 * `runPromise`. Covers every token rule, the LOAD-BEARING inversion (an OFF strict flag
 * emits NO token), the project-kind/build-tool omit-when-unknown behavior, and the
 * always-absent `typecheck:ok` (discovery hardcodes `typecheckOk: false`).
 */

import { describe, expect, it } from "vitest";
import { computeCapabilities } from "../main/capabilities.js";
import type { ProjectInfo } from "../main/ProjectInfo.js";

/** A baseline discovered project: minimal known facts, everything else unknown/off. */
const base = (overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
  rootDirectory: "/p",
  projectName: "p",
  tsVersion: null,
  tsMajor: null,
  projectKind: "unknown",
  moduleSystem: "esm",
  buildTool: "unknown",
  strictFlags: {},
  typecheckOk: false,
  sourceFileCount: 0,
  ...overrides,
});

describe("computeCapabilities — always-on + module tokens", () => {
  it('always emits "tsconfig"', () => {
    expect(computeCapabilities(base()).has("tsconfig")).toBe(true);
  });

  it("emits esm + moduleResolution:bundler for an ESM project", () => {
    const caps = computeCapabilities(base({ moduleSystem: "esm" }));
    expect(caps.has("esm")).toBe(true);
    expect(caps.has("moduleResolution:bundler")).toBe(true);
    expect(caps.has("cjs")).toBe(false);
  });

  it("emits cjs + moduleResolution:node for a CJS project", () => {
    const caps = computeCapabilities(base({ moduleSystem: "cjs" }));
    expect(caps.has("cjs")).toBe(true);
    expect(caps.has("moduleResolution:node")).toBe(true);
    expect(caps.has("esm")).toBe(false);
  });
});

describe("computeCapabilities — ts:<major.minor> token", () => {
  it("emits ts:5.8 from a 5.8.2 version", () => {
    expect(computeCapabilities(base({ tsVersion: "5.8.2" })).has("ts:5.8")).toBe(true);
  });

  it("emits ts:4.9 from 4.9.0", () => {
    expect(computeCapabilities(base({ tsVersion: "4.9.0" })).has("ts:4.9")).toBe(true);
  });

  it("emits NO ts:* token when version is null", () => {
    const caps = computeCapabilities(base({ tsVersion: null }));
    expect([...caps].some((c) => c.startsWith("ts:"))).toBe(false);
  });

  it("emits NO ts:* token when version is unparseable garbage", () => {
    const caps = computeCapabilities(base({ tsVersion: "next" }));
    expect([...caps].some((c) => c.startsWith("ts:"))).toBe(false);
  });
});

describe("computeCapabilities — strict-flag tokens (the load-bearing inversion)", () => {
  it("emits ONE token per ON strict flag", () => {
    const caps = computeCapabilities(
      base({ strictFlags: { strict: true, noUncheckedIndexedAccess: true } }),
    );
    expect(caps.has("strict")).toBe(true);
    expect(caps.has("noUncheckedIndexedAccess")).toBe(true);
  });

  it("an OFF strict flag (recorded false) emits NO token — drives RULE-020 inverse gating", () => {
    // Discovery only records flags that are ON, but assert the false-handling explicitly.
    const caps = computeCapabilities(
      base({ strictFlags: { strict: false, noImplicitAny: true } }),
    );
    expect(caps.has("strict")).toBe(false); // OFF → absent (the inversion)
    expect(caps.has("noImplicitAny")).toBe(true);
  });

  it("an absent strict flag emits NO token", () => {
    const caps = computeCapabilities(base({ strictFlags: {} }));
    expect(caps.has("strict")).toBe(false);
    expect(caps.has("exactOptionalPropertyTypes")).toBe(false);
  });
});

describe("computeCapabilities — project-kind token (omit when unknown)", () => {
  it.each(["app", "lib", "monorepo"] as const)("emits %s when known", (kind) => {
    expect(computeCapabilities(base({ projectKind: kind })).has(kind)).toBe(true);
  });

  it("emits NO kind token when unknown", () => {
    const caps = computeCapabilities(base({ projectKind: "unknown" }));
    expect(caps.has("app")).toBe(false);
    expect(caps.has("lib")).toBe(false);
    expect(caps.has("monorepo")).toBe(false);
    expect(caps.has("unknown")).toBe(false);
  });
});

describe("computeCapabilities — build:<tool> token (omit when unknown)", () => {
  it.each(["tsc", "tsup", "vite", "swc", "esbuild", "bun", "babel"] as const)(
    "emits build:%s when known",
    (tool) => {
      expect(computeCapabilities(base({ buildTool: tool })).has(`build:${tool}`)).toBe(
        true,
      );
    },
  );

  it("emits NO build:* token when unknown", () => {
    const caps = computeCapabilities(base({ buildTool: "unknown" }));
    expect([...caps].some((c) => c.startsWith("build:"))).toBe(false);
  });
});

describe("computeCapabilities — typecheck:ok gate", () => {
  it("absent when typecheckOk is false (the discovery-hardcoded PENDING value)", () => {
    expect(computeCapabilities(base({ typecheckOk: false })).has("typecheck:ok")).toBe(
      false,
    );
  });

  it("present ONLY when typecheckOk is true (the engine-reconciled path)", () => {
    expect(computeCapabilities(base({ typecheckOk: true })).has("typecheck:ok")).toBe(
      true,
    );
  });
});

describe("computeCapabilities — a realistic full project", () => {
  it("emits the full vocabulary for a strict ESM Vite lib on TS 5.8", () => {
    const caps = computeCapabilities(
      base({
        tsVersion: "5.8.2",
        moduleSystem: "esm",
        projectKind: "lib",
        buildTool: "vite",
        strictFlags: { strict: true, noUncheckedIndexedAccess: true },
      }),
    );
    expect([...caps].sort()).toEqual(
      [
        "tsconfig",
        "ts:5.8",
        "strict",
        "noUncheckedIndexedAccess",
        "esm",
        "moduleResolution:bundler",
        "lib",
        "build:vite",
      ].sort(),
    );
  });
});
