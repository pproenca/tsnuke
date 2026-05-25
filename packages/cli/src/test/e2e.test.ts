/**
 * Full end-to-end `ts-doctor <dir>` runs through the `@effect/cli` command tree against a
 * REAL temp TS project, with a capturing Terminal Layer (so stdout is asserted, not
 * spawned). Proves the whole pipe — POSIX parse → `inspect` handler → engine `diagnose`
 * → output → exit code — works as one wired unit.
 *
 *   - a CLEAN project + `--score` → the score line (100/Great) + exit 0
 *   - a project WITH a violation → diagnostics + (default --fail-on error) the right exit
 *   - `install` subcommand dispatch → writes the stub files, exit 0
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../main/cli.js";
import { e2eLayer } from "./stubTerminal.js";

const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

let dir: string;
let savedExitCode: typeof process.exitCode;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsdoctor-e2e-"));
  savedExitCode = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.exitCode = savedExitCode;
});

/** Run the full command tree with a captured Terminal; returns the captured stdout. */
const runCli = async (argv: readonly string[]): Promise<string> => {
  const env = e2eLayer();
  // `@effect/cli` strips the node/script prefix, so prepend two placeholders.
  await Effect.runPromise(
    run(["node", "ts-doctor", ...argv]).pipe(Effect.provide(env.layer)),
  );
  return env.output.join("");
};

describe("end-to-end: ts-doctor <dir>", () => {
  it("CLEAN project + --score → score line + exit 0", async () => {
    writeFileSync(join(dir, "tsconfig.json"), STRICT_TSCONFIG);
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "index.ts"),
      "export const greet = (name: string): string => `hi ${name}`;\n",
    );

    const stdout = await runCli([dir, "--score"]);
    expect(stdout).toContain("Score: 100/100 — Great");
    expect(process.exitCode).toBe(0);
  });

  it("project WITH a violation (default --fail-on error) → diagnostics + exit", async () => {
    writeFileSync(join(dir, "tsconfig.json"), STRICT_TSCONFIG);
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "bad.ts"),
      "export function f(x: any): number {\n  return Number(x);\n}\n",
    );

    const stdout = await runCli([dir, "--format", "agent"]);
    const parsed = JSON.parse(stdout);
    const ruleIds: string[] = parsed.categories.flatMap((c: { rules: { rule: string }[] }) =>
      c.rules.map((r) => r.rule),
    );
    expect(ruleIds).toContain("no-explicit-any");
    // `no-explicit-any` is a warning by default → --fail-on error does NOT trip → exit 0.
    // (The presence of diagnostics is the assertion; the gate semantics are RULE-030.)
    expect(process.exitCode).toBe(0);
  });

  it("--json on a violation project emits the versioned report", async () => {
    writeFileSync(join(dir, "tsconfig.json"), STRICT_TSCONFIG);
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "bad.ts"),
      "export function f(x: any): number {\n  return Number(x);\n}\n",
    );
    const stdout = await runCli([dir, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.mode).toBe("full");
    expect(parsed.summary.totalDiagnosticCount).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);
  });

  it("install subcommand dispatch → writes stub files, exit 0", async () => {
    await runCli(["install", "--cwd", dir]);
    expect(readFileSync(join(dir, ".agent/skills/ts-doctor/SKILL.md"), "utf8")).toContain(
      "name: ts-doctor",
    );
    expect(readFileSync(join(dir, ".git/hooks/pre-push"), "utf8")).toContain("exit 0");
    expect(process.exitCode).toBe(0);
  });

  it("--help (auto-help, a new @effect/cli capability) succeeds, doesn't crash", async () => {
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-doctor", "--help"]).pipe(Effect.provide(env.layer)),
    );
    // `@effect/cli` renders built-in help to its own console sink; we only assert the
    // program resolves cleanly (help is the library's job, new vs the hand-rolled parser).
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("an unknown flag is rejected by the POSIX parser", async () => {
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-doctor", "--definitely-not-a-flag"]).pipe(Effect.provide(env.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
