/**
 * `install` (RULE-038) — behavioral tests over a REAL temp dir + the Node FileSystem
 * Layer. Asserts: writes the real SKILL.md + the INERT pre-push stub (verbatim body) +
 * the `{}` agent-hook config under `--agent-hooks`; `--dry-run` writes NOTHING; always
 * exit 0. PRESERVED-DEFECT: the inert/clobbering hook is asserted as-is, not "fixed".
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSkillMarkdown,
  planInstall,
  runInstall,
  type InstallFlags,
} from "../main/installHandler.js";

let dir: string;
const out: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsfix-install-"));
  out.length = 0;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const stdout = (text: string) => Effect.sync(() => void out.push(text));

const run = (flags: Partial<InstallFlags>): Promise<0> =>
  Effect.runPromise(
    runInstall(
      { cwd: dir, yes: false, dryRun: false, agentHooks: false, ...flags },
      stdout,
    ).pipe(Effect.provide(NodeContext.layer)),
  );

describe("planInstall (pure) — RULE-038 plan", () => {
  it("plans SKILL.md + pre-push always; agent-hook only with --agent-hooks", () => {
    const base = planInstall({ cwd: "/x", yes: false, dryRun: false, agentHooks: false });
    expect(base.map((w) => w.path)).toEqual([
      "/x/.agent/skills/ts-fix/SKILL.md",
      "/x/.git/hooks/pre-push",
    ]);
    const withHooks = planInstall({
      cwd: "/x",
      yes: false,
      dryRun: false,
      agentHooks: true,
    });
    expect(withHooks.map((w) => w.path)).toContain("/x/.claude/hooks/ts-fix.json");
  });

  it("the pre-push body is the INERT stub (preserved defect, verbatim)", () => {
    const hook = planInstall({
      cwd: "/x",
      yes: false,
      dryRun: false,
      agentHooks: false,
    }).find((w) => w.path.endsWith("pre-push"));
    expect(hook?.contents).toBe(
      "#!/bin/sh\n# TODO(P1): non-blocking ts-fix pre-push check\nexit 0\n",
    );
  });

  it("buildSkillMarkdown is a real, deterministic SKILL.md", () => {
    const md = buildSkillMarkdown();
    expect(md).toContain("name: ts-fix");
    expect(md).toContain("npx ts-fix --format agent");
    expect(buildSkillMarkdown()).toBe(md); // deterministic
  });
});

describe("runInstall over a real temp dir (Node FileSystem)", () => {
  it("writes the real SKILL.md + inert pre-push; returns 0", async () => {
    const code = await run({});
    expect(code).toBe(0);
    const skill = join(dir, ".agent/skills/ts-fix/SKILL.md");
    const hook = join(dir, ".git/hooks/pre-push");
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, "utf8")).toContain("name: ts-fix");
    // PRESERVED DEFECT: the hook exists but is inert.
    expect(readFileSync(hook, "utf8")).toBe(
      "#!/bin/sh\n# TODO(P1): non-blocking ts-fix pre-push check\nexit 0\n",
    );
    expect(out.join("")).toContain("wrote");
  });

  it("--agent-hooks also writes the {} hook config", async () => {
    await run({ agentHooks: true });
    const cfg = join(dir, ".claude/hooks/ts-fix.json");
    expect(readFileSync(cfg, "utf8")).toBe("{}\n");
  });

  it("--dry-run writes NOTHING but describes the plan; returns 0", async () => {
    const code = await run({ dryRun: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, ".agent/skills/ts-fix/SKILL.md"))).toBe(false);
    expect(existsSync(join(dir, ".git/hooks/pre-push"))).toBe(false);
    expect(out.join("")).toContain("[dry-run] would write");
  });

  it("CONFIRMED DEFECT: clobbers an existing pre-push hook unconditionally", async () => {
    // Pre-seed an existing, meaningful hook directly via node fs.
    const hooksDir = join(dir, ".git/hooks");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, "pre-push"), "#!/bin/sh\necho real-hook\nexit 1\n");
    await run({});
    // The real hook was overwritten with the inert stub — the documented defect.
    const after = readFileSync(join(hooksDir, "pre-push"), "utf8");
    expect(after).toContain("exit 0");
    expect(after).not.toContain("real-hook");
  });
});
