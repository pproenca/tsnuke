import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeCapabilities,
  discoverTsProject,
} from "./discover-ts-project.js";
import {
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
} from "./errors.js";
import type { ProjectInfo } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "tests", "fixtures");

describe("discoverTsProject (BC-06)", () => {
  it("throws TsconfigNotFoundError when no tsconfig.json exists", () => {
    expect(() => discoverTsProject(join(fixtures, "no-tsconfig"))).toThrow(
      TsconfigNotFoundError,
    );
  });

  it("throws NoTypeScriptProjectError when no typescript and no .ts sources", () => {
    expect(() => discoverTsProject(join(fixtures, "no-ts-anywhere"))).toThrow(
      NoTypeScriptProjectError,
    );
  });

  it("discovers a valid TS project: strict flags, app kind, build tool, esm", () => {
    const info = discoverTsProject(join(fixtures, "with-tsconfig"));
    expect(info.projectName).toBe("fixture-app");
    expect(info.strictFlags["strict"]).toBe(true);
    expect(info.strictFlags["noUncheckedIndexedAccess"]).toBe(true);
    expect(info.projectKind).toBe("app"); // has bin + start script
    expect(info.moduleSystem).toBe("esm"); // package.json type:module
    expect(info.buildTool).toBe("tsup");
    expect(info.sourceFileCount).toBeGreaterThanOrEqual(1);
    // Discovery never type-checks — typecheckOk defaults false (BC-07 honesty).
    expect(info.typecheckOk).toBe(false);
  });
});

describe("computeCapabilities (BC-07)", () => {
  function baseInfo(over: Partial<ProjectInfo> = {}): ProjectInfo {
    return {
      rootDirectory: "/x",
      projectName: "p",
      tsVersion: "5.8.2",
      tsMajor: 5,
      projectKind: "lib",
      moduleSystem: "esm",
      buildTool: "tsup",
      strictFlags: { strict: true, noUncheckedIndexedAccess: true },
      typecheckOk: false,
      sourceFileCount: 3,
      ...over,
    };
  }

  it("emits the expected token vocabulary", () => {
    const caps = computeCapabilities(baseInfo());
    expect(caps.has("tsconfig")).toBe(true);
    expect(caps.has("ts:5.8")).toBe(true);
    expect(caps.has("strict")).toBe(true);
    expect(caps.has("noUncheckedIndexedAccess")).toBe(true);
    expect(caps.has("esm")).toBe(true);
    expect(caps.has("moduleResolution:bundler")).toBe(true);
    expect(caps.has("lib")).toBe(true);
    expect(caps.has("build:tsup")).toBe(true);
  });

  it("omits typecheck:ok unless typecheckOk is true (gated Tier-2 signal)", () => {
    expect(computeCapabilities(baseInfo({ typecheckOk: false })).has("typecheck:ok")).toBe(
      false,
    );
    expect(computeCapabilities(baseInfo({ typecheckOk: true })).has("typecheck:ok")).toBe(
      true,
    );
  });

  it("INVERSION: a strict flag that is OFF emits no token (BC-07/BC-09)", () => {
    // strict not in strictFlags → no "strict" token → an enable-strict CFG rule
    // (disabledBy:["strict"]) would fire.
    const caps = computeCapabilities(baseInfo({ strictFlags: {} }));
    expect(caps.has("strict")).toBe(false);
    expect(caps.has("noUncheckedIndexedAccess")).toBe(false);
  });

  it("emits cjs + moduleResolution:node for a commonjs project", () => {
    const caps = computeCapabilities(baseInfo({ moduleSystem: "cjs" }));
    expect(caps.has("cjs")).toBe(true);
    expect(caps.has("moduleResolution:node")).toBe(true);
    expect(caps.has("esm")).toBe(false);
  });

  it("omits app/lib/monorepo and build:* tokens when unknown", () => {
    const caps = computeCapabilities(
      baseInfo({ projectKind: "unknown", buildTool: "unknown" }),
    );
    expect(caps.has("lib")).toBe(false);
    expect([...caps].some((c) => c.startsWith("build:"))).toBe(false);
  });
});
