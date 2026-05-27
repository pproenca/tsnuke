/**
 * `install` — behavioral tests over a REAL temp dir + the Node FileSystem Layer.
 *
 * Asserts:
 *   - Writes the real SKILL.md + a real non-blocking pre-push hook (no longer the
 *     inert stub the legacy install shipped — the RULE-038 preserved defect is fixed).
 *   - Refuses to clobber an existing non-tsnuke pre-push hook; emits a one-line
 *     instruction instead.
 *   - Idempotent re-install: a re-run overwrites our OWN marker-bearing hook safely.
 *   - `--dry-run` writes NOTHING but describes the plan, including the SKIP for
 *     an existing non-tsnuke hook.
 *   - Always exit 0.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  planInstall,
  PRE_PUSH_HOOK,
  runInstall,
  type InstallFlags,
} from "../main/installHandler.js";

let dir: string;
const out: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsnuke-install-"));
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

describe("planInstall (pure)", () => {
  it("plans SKILL.md + pre-push always; agent-hook only with --agent-hooks", () => {
    const base = planInstall({ cwd: "/x", yes: false, dryRun: false, agentHooks: false });
    expect(base.map((w) => w.path)).toEqual([
      "/x/.agent/skills/tsnuke/SKILL.md",
      "/x/.git/hooks/pre-push",
    ]);
    const withHooks = planInstall({
      cwd: "/x",
      yes: false,
      dryRun: false,
      agentHooks: true,
    });
    expect(withHooks.map((w) => w.path)).toContain("/x/.claude/hooks/tsnuke.json");
  });

  it("the pre-push body is the new non-blocking hook carrying the tsnuke marker", () => {
    const hook = planInstall({
      cwd: "/x",
      yes: false,
      dryRun: false,
      agentHooks: false,
    }).find((w) => w.path.endsWith("pre-push"));
    expect(hook?.contents).toBe(PRE_PUSH_HOOK);
    // P6: hook marker bumped from v1 → v2 when the default switched to --diff.
    // Re-installs over a v1 hook are still allowed (LEGACY_HOOK_MARKERS).
    expect(hook?.contents).toContain("# tsnuke-managed v2");
    // P6: the hook now runs `--diff --score` (regression check, fast on every
    // push). The previous full-tree `--score` was renamed to a slow,
    // explicit-only invocation; the hook should never block a push.
    expect(hook?.contents).toContain("npx --no tsnuke --diff --score");
    expect(hook?.contents).not.toContain("--no-install");
    expect(hook?.contents).toContain("exit 0");
  });

  it("the SKILL.md content carries the AGENTS.md front-matter + playbook + rule index", () => {
    const skill = planInstall({ cwd: "/x", yes: false, dryRun: false, agentHooks: false })
      .find((w) => w.path.endsWith("SKILL.md"))?.contents ?? "";
    // Front-matter intact
    expect(skill).toContain("name: tsnuke");
    // Canonical playbook inlined (sentinel from prompts/agent.md)
    expect(skill).toContain("# tsnuke — agent playbook");
    expect(skill).toContain("npx -y tsnuke@latest --diff --format agent");
    // Rule index appended (replaced the heavy full-catalog table — agents fetch
    // per-rule prompts on demand from pproenca.dev/tsnuke/prompts/rules/<id>.md)
    expect(skill).toContain("## Rule index");
    expect(skill).toContain("https://pproenca.dev/tsnuke/prompts/rules/$rule.md");
  });
});

describe("runInstall over a real temp dir (Node FileSystem)", () => {
  it("writes SKILL.md + the real non-blocking pre-push hook; returns 0", async () => {
    const code = await run({});
    expect(code).toBe(0);
    const skill = join(dir, ".agent/skills/tsnuke/SKILL.md");
    const hook = join(dir, ".git/hooks/pre-push");
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, "utf8")).toContain("name: tsnuke");
    expect(readFileSync(hook, "utf8")).toBe(PRE_PUSH_HOOK);
    expect(out.join("")).toContain("wrote");
  });

  it("--agent-hooks also writes the {} hook config", async () => {
    await run({ agentHooks: true });
    const cfg = join(dir, ".claude/hooks/tsnuke.json");
    expect(readFileSync(cfg, "utf8")).toBe("{}\n");
  });

  it("--dry-run writes NOTHING but describes the plan; returns 0", async () => {
    const code = await run({ dryRun: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, ".agent/skills/tsnuke/SKILL.md"))).toBe(false);
    expect(existsSync(join(dir, ".git/hooks/pre-push"))).toBe(false);
    expect(out.join("")).toContain("[dry-run] would write");
  });

  it("refuses to clobber an existing non-tsnuke pre-push hook; SKILL.md still written", async () => {
    const hooksDir = join(dir, ".git/hooks");
    const realHookBody = "#!/bin/sh\necho real-hook\nexit 1\n";
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, "pre-push"), realHookBody);
    const code = await run({});
    expect(code).toBe(0);
    // The user's pre-existing hook is INTACT — the defect is fixed.
    expect(readFileSync(join(hooksDir, "pre-push"), "utf8")).toBe(realHookBody);
    // The SKILL.md is still installed.
    expect(existsSync(join(dir, ".agent/skills/tsnuke/SKILL.md"))).toBe(true);
    // A clear instruction lands on stdout (the suggested line is the new `--diff`
    // default — P6 — so users who append it get the fast regression check).
    const text = out.join("");
    expect(text).toContain("refusing to overwrite");
    expect(text).toContain("npx --no tsnuke --diff --score");
  });

  it("idempotent re-install: a marker-bearing hook IS overwritten safely (v1 → v2)", async () => {
    const hooksDir = join(dir, ".git/hooks");
    mkdirSync(hooksDir, { recursive: true });
    // Simulate a previous install with the v1 marker; P6 added v2 with `--diff`.
    // The new install MUST recognise v1 as tsnuke-owned and upgrade it cleanly
    // (LEGACY_HOOK_MARKERS in installHandler.ts).
    writeFileSync(
      join(hooksDir, "pre-push"),
      "#!/bin/sh\n# tsnuke-managed v1\n# stale content\nexit 0\n",
    );
    await run({});
    expect(readFileSync(join(hooksDir, "pre-push"), "utf8")).toBe(PRE_PUSH_HOOK);
  });

  it("--dry-run with an existing non-tsnuke hook reports it as SKIP", async () => {
    const hooksDir = join(dir, ".git/hooks");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, "pre-push"), "#!/bin/sh\necho real-hook\n");
    await run({ dryRun: true });
    expect(out.join("")).toContain("would SKIP");
  });
});
