/**
 * Full end-to-end `ts-fix <dir>` runs through the `@effect/cli` command tree against a
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
import { Cause, Effect, Exit } from "effect";
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
  dir = mkdtempSync(join(tmpdir(), "tsfix-e2e-"));
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
    run(["node", "ts-fix", ...argv]).pipe(Effect.provide(env.layer)),
  );
  return env.output.join("");
};

describe("end-to-end: ts-fix <dir>", () => {
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
    expect(readFileSync(join(dir, ".agent/skills/ts-fix/SKILL.md"), "utf8")).toContain(
      "name: ts-fix",
    );
    expect(readFileSync(join(dir, ".git/hooks/pre-push"), "utf8")).toContain("exit 0");
    expect(process.exitCode).toBe(0);
  });

  it("--help (auto-help, a new @effect/cli capability) succeeds, doesn't crash", async () => {
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-fix", "--help"]).pipe(Effect.provide(env.layer)),
    );
    // `@effect/cli` renders built-in help to its own console sink; we only assert the
    // program resolves cleanly (help is the library's job, new vs the hand-rolled parser).
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("an unknown flag is rejected by the POSIX parser", async () => {
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-fix", "--definitely-not-a-flag"]).pipe(Effect.provide(env.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

// ── Regression: the `@effect/cli` boolean tri-state bug ──────────────────────────────
// `Options.boolean(name, { negationNames }).pipe(Options.optional)` yields `Some(false)`
// when the flag is ABSENT (a boolean option always resolves) — never `None`. That made
// every "auto" / "default-on" toggle collapse into "force-off": the type-aware Tier-2 was
// silently skipped (partial score) on every DEFAULT run, the pretty score line vanished,
// and inline-disable directives were ignored. These tests drive the REAL argv parser
// end-to-end — the bug hid because the prior unit tests injected `Option.none` directly,
// modelling a parser output that never actually occurs. See `inspectCommand.triStateBoolean`.
describe("regression: boolean tri-state defaults (real argv parse)", () => {
  const writeCleanProject = (): void => {
    writeFileSync(join(dir, "tsconfig.json"), STRICT_TSCONFIG);
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "index.ts"),
      "export const inc = (n: number): number => n + 1;\n",
    );
  };
  const writeSuppressedAnyProject = (): void => {
    writeFileSync(join(dir, "tsconfig.json"), STRICT_TSCONFIG);
    mkdirSync(join(dir, "src"));
    // The directive on line 1 suppresses `no-explicit-any` on line 2 (the `any`).
    writeFileSync(
      join(dir, "src", "bad.ts"),
      "// ts-fix-disable-next-line no-explicit-any\n" +
        "export function f(x: any): number {\n  return Number(x);\n}\n",
    );
  };
  const agentRuleIds = (stdout: string): string[] =>
    (JSON.parse(stdout).categories as { rules: { rule: string }[] }[]).flatMap((c) =>
      c.rules.map((r) => r.rule),
    );

  it("DEFAULT run auto-enables Tier-2 on a clean project (score NOT partial)", async () => {
    writeCleanProject();
    const stdout = await runCli([dir, "--score"]);
    expect(stdout).toContain("Score:");
    expect(stdout).not.toContain("partial"); // the bug: was partial-by-default
  });

  it("--no-deep still forces Tier-2 OFF (score IS partial)", async () => {
    writeCleanProject();
    const stdout = await runCli([dir, "--score", "--no-deep"]);
    expect(stdout).toContain("partial");
  });

  it("--deep forces Tier-2 ON (score NOT partial)", async () => {
    writeCleanProject();
    const stdout = await runCli([dir, "--score", "--deep"]);
    expect(stdout).not.toContain("partial");
  });

  it("--deep + --no-deep is rejected by the parser (mutual exclusivity)", async () => {
    writeCleanProject();
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-fix", dir, "--deep", "--no-deep"]).pipe(Effect.provide(env.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("DEFAULT pretty output shows the score line (--show-score default on)", async () => {
    writeCleanProject();
    const stdout = await runCli([dir]);
    expect(stdout).toContain("Score:");
  });

  it("--no-score hides the score line in pretty output", async () => {
    writeCleanProject();
    const stdout = await runCli([dir, "--no-score"]);
    expect(stdout).not.toContain("Score:");
  });

  it("DEFAULT run honours inline-disable directives (--respect-inline-disables default on)", async () => {
    writeSuppressedAnyProject();
    const stdout = await runCli([dir, "--format", "agent"]);
    expect(agentRuleIds(stdout)).not.toContain("no-explicit-any"); // suppressed
  });

  it("--no-respect-inline-disables surfaces the otherwise-suppressed diagnostic", async () => {
    writeSuppressedAnyProject();
    const stdout = await runCli([dir, "--format", "agent", "--no-respect-inline-disables"]);
    expect(agentRuleIds(stdout)).toContain("no-explicit-any"); // directive ignored
  });
});

// ── Regression: engine errors must reach the FAIL channel, not the DIE channel ────────
// The production `diagnose` seam wraps `diagnoseNode` — which REJECTS on a non-TS
// directory (`TsconfigNotFoundError`). It was wired with `Effect.promise`, routing the
// rejection to the DIE channel; `bin.ts` extracts its terse `ts-fix: <message>` via
// `Cause.failureOption` (the FAIL channel only), so a die fell through to the raw
// `Cause.pretty` dump — `(FiberFailure) TsconfigNotFoundError: … \n  at file://…cli.js:NNN`.
// The fix uses `Effect.tryPromise({ catch: (e) => e })` so the original `Error` lands in
// the FAIL channel. These tests drive the REAL command tree against a REAL non-TS temp
// dir; the prior suite hid the defect by injecting a canned `diagnose` result that never
// exercised the real `diagnoseNode` rejection. See `inspectCommand.makeRealIo`.
describe("regression: engine error reaches the fail channel (real diagnoseNode)", () => {
  it("a directory WITHOUT tsconfig fails via the FAIL channel, not a defect", async () => {
    // No tsconfig.json written — `diagnoseNode` rejects with `TsconfigNotFoundError`.
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-fix", dir]).pipe(Effect.provide(env.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      // The fix's essence: the error is a FAILURE, not a DEFECT (die). bin.ts only
      // extracts clean messages from the fail channel — a die would dump the raw cause.
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some"); // before the fix this was `None` (it was a die)
      expect(Cause.dieOption(exit.cause)._tag).toBe("None");
    }
  });

  it("the surfaced failure is an Error whose .message is bin.ts-printable (clean, no cause dump)", async () => {
    const env = e2eLayer();
    const exit = await Effect.runPromiseExit(
      run(["node", "ts-fix", dir]).pipe(Effect.provide(env.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        // Replicates bin.ts's extraction: an `Error` failure → its `.message` is printed
        // verbatim as `ts-fix: <message>`. Assert it's the clean human message, with
        // none of the `Cause.pretty` leakage (`FiberFailure`, an internal stack frame).
        expect(failure.value).toBeInstanceOf(Error);
        const message = (failure.value as Error).message;
        expect(message).toContain("No tsconfig.json found");
        expect(message).toContain("ts-fix analyzes TypeScript projects only");
        expect(message).not.toContain("FiberFailure");
        expect(message).not.toMatch(/\bat .*cli\.js:/);
      }
    }
  });
});
