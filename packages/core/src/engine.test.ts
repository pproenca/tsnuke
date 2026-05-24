import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runEngine, type SourceFileInput } from "./engine.js";

const vfile = (text: string): SourceFileInput[] => [
  { filePath: resolve("virtual-engine-test.ts"), text },
];
const NO_CAPS = new Set<string>();
const NO_TAGS = new Set<string>();
const NO_OVERRIDES = new Map<string, "error" | "warning" | "off">();

describe("runEngine — two-tier integration (§4.1)", () => {
  it("builds one Program, derives typecheck:ok, runs Tier-2 (flags a floating promise)", () => {
    const res = runEngine(
      vfile("Promise.resolve(1);\n"),
      NO_CAPS,
      NO_TAGS,
      NO_OVERRIDES,
      undefined,
    );
    expect(res.scorePartial).toBe(false); // clean type-check → Tier-2 ran
    expect(res.skippedChecks).toHaveLength(0);
    const typ = res.diagnostics.find((d) => d.rule === "no-floating-promises");
    expect(typ).toBeDefined();
    expect(typ!.tier).toBe("TYP");
  });

  it("--no-deep skips Tier-2 → partial honesty, no TYP diagnostics (BC-03)", () => {
    const res = runEngine(
      vfile("Promise.resolve(1);\n"),
      NO_CAPS,
      NO_TAGS,
      NO_OVERRIDES,
      /* deep */ false,
    );
    expect(res.scorePartial).toBe(true);
    expect(res.skippedChecks).toContain("no-floating-promises");
    expect(res.diagnostics.some((d) => d.rule === "no-floating-promises")).toBe(false);
  });

  it("emits a project-level CFG finding when a strictness flag is off (BC-09)", () => {
    // Only `tsconfig` present → `strict` is OFF → enable-strict activates.
    const res = runEngine(
      [],
      new Set(["tsconfig"]),
      NO_TAGS,
      NO_OVERRIDES,
      /* deep */ false,
      undefined,
      "/proj/tsconfig.json",
    );
    const cfg = res.diagnostics.find((d) => d.rule === "enable-strict");
    expect(cfg).toBeDefined();
    expect(cfg!.tier).toBe("CFG");
    expect(cfg!.filePath).toBe("/proj/tsconfig.json");
    expect(cfg!.line).toBe(1);
  });

  it("CFG strictness rule self-disables when the flag is already on", () => {
    const res = runEngine(
      [],
      new Set(["tsconfig", "strict"]),
      NO_TAGS,
      NO_OVERRIDES,
      false,
    );
    expect(res.diagnostics.some((d) => d.rule === "enable-strict")).toBe(false);
  });

  it("GRAPH tier: flags an import cycle across the file set", () => {
    const a = resolve("graph-a.ts");
    const b = resolve("graph-b.ts");
    const files = [
      { filePath: a, text: 'import { b } from "./graph-b";\nexport const a = 1;\n' },
      { filePath: b, text: 'import { a } from "./graph-a";\nexport const b = 2;\n' },
    ];
    const res = runEngine(files, NO_CAPS, NO_TAGS, NO_OVERRIDES, /* deep */ false);
    const cyc = res.diagnostics.find((d) => d.rule === "no-import-cycles");
    expect(cyc).toBeDefined();
    expect(cyc!.tier).toBe("GRAPH");
  });

  it("GRAPH tier: flags an unused export in an app project", () => {
    const main = resolve("ux-main.ts");
    const util = resolve("ux-util.ts");
    const files = [
      { filePath: main, text: 'import { used } from "./ux-util";\nexport const run = () => used();\n' },
      { filePath: util, text: "export const used = () => 1;\nexport const unused = () => 2;\n" },
    ];
    const res = runEngine(files, new Set(["app"]), NO_TAGS, NO_OVERRIDES, false);
    const dead = res.diagnostics.filter((d) => d.rule === "no-unused-exports");
    expect(dead).toHaveLength(1);
    expect(dead[0]!.tier).toBe("GRAPH");
    expect(dead[0]!.message).toContain("unused");
  });

  it("GRAPH no-unused-exports is gated OFF for non-app projects", () => {
    const main = resolve("ux2-main.ts");
    const util = resolve("ux2-util.ts");
    const files = [
      { filePath: main, text: 'import { used } from "./ux2-util";\nexport const run = () => used();\n' },
      { filePath: util, text: "export const used = () => 1;\nexport const unused = () => 2;\n" },
    ];
    const res = runEngine(files, new Set(["lib"]), NO_TAGS, NO_OVERRIDES, false);
    expect(res.diagnostics.some((d) => d.rule === "no-unused-exports")).toBe(false);
  });

  it("runs Tier-1 SYN rules alongside Tier-2 on the healthy path", () => {
    const res = runEngine(
      vfile("let x: any = 1;\nPromise.resolve(1);\n"),
      NO_CAPS,
      NO_TAGS,
      NO_OVERRIDES,
      undefined,
    );
    expect(
      res.diagnostics.some((d) => d.rule === "no-explicit-any" && d.tier === "SYN"),
    ).toBe(true);
    expect(
      res.diagnostics.some((d) => d.rule === "no-floating-promises" && d.tier === "TYP"),
    ).toBe(true);
  });
});
