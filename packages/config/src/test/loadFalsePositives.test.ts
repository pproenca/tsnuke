/**
 * `.tsnuke/false-positives.md` loader + parser (P5).
 */

import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodePath } from "@effect/platform-node";
import { loadFalsePositives, parseFalsePositives } from "../main/loadFalsePositives.js";

describe("parseFalsePositives — markdown → suppressions", () => {
  it("parses one entry per line with inline reason", () => {
    const text = `
# Project-local false positives
no-default-export: src/pages/**/*.tsx  # Pages Router pages
no-non-null-assertion: **/*.test.ts    # canonical test idiom
`;
    const out = parseFalsePositives(text);
    expect(out).toEqual([
      { rule: "no-default-export", fileGlob: "src/pages/**/*.tsx", reason: "Pages Router pages" },
      { rule: "no-non-null-assertion", fileGlob: "**/*.test.ts", reason: "canonical test idiom" },
    ]);
  });

  it("falls back to a placeholder reason when none provided", () => {
    const out = parseFalsePositives("no-explicit-any: src/legacy/**");
    expect(out[0]!.reason).toBe("project-local suppression");
  });

  it("skips comment lines and blank lines", () => {
    const text = `

# section header
# another comment
no-var: src/foo.ts

`;
    const out = parseFalsePositives(text);
    expect(out).toEqual([
      { rule: "no-var", fileGlob: "src/foo.ts", reason: "project-local suppression" },
    ]);
  });

  it("silently drops malformed lines (no `:`)", () => {
    const out = parseFalsePositives("not a valid entry\nno-var: ok.ts");
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe("no-var");
  });

  it("returns [] for empty input", () => {
    expect(parseFalsePositives("")).toEqual([]);
    expect(parseFalsePositives("\n\n   \n")).toEqual([]);
  });
});

/**
 * Tiny in-memory FileSystem stub for the loader's IO tests. Only implements
 * `readFileString` (the one method the loader uses) — every other method is
 * a stub that throws (test runner surfaces the failure if we call something
 * we didn't expect). Returning `Effect.fail(new Error("not found"))` is fine
 * because the loader pipes through `Effect.orElseSucceed(() => undefined)`,
 * collapsing every failure shape to the "absent file" branch.
 */
function makeStubFs(files: Record<string, string>): Layer.Layer<FileSystem.FileSystem> {
  // Test stub: only `readFileString` is real; every other method is a thrower
  // (we never call them). The double-assertion below is the conventional way
  // to satisfy `Layer.succeed`'s full-interface requirement from a partial
  // mock — see prompts/rules/no-double-assertion.md (test fixtures suppression).
  // tsnuke-disable-next-line no-double-assertion
  const stub = {
    readFileString: (p: string) => {
      const text = files[p];
      return text === undefined
        ? Effect.fail(new Error(`not found: ${p}`))
        : Effect.succeed(text);
    },
  } as unknown as FileSystem.FileSystem;
  return Layer.succeed(FileSystem.FileSystem, stub);
}

describe("loadFalsePositives — file IO", () => {
  it("returns [] when .tsnuke/false-positives.md doesn't exist", async () => {
    const out = await Effect.runPromise(
      loadFalsePositives("/proj").pipe(
        Effect.provide(makeStubFs({})),
        Effect.provide(NodePath.layer),
      ),
    );
    expect(out).toEqual([]);
  });

  it("parses an existing .tsnuke/false-positives.md", async () => {
    const out = await Effect.runPromise(
      loadFalsePositives("/proj").pipe(
        Effect.provide(
          makeStubFs({
            "/proj/.tsnuke/false-positives.md":
              "no-default-export: src/legacy/**  # WIP migration",
          }),
        ),
        Effect.provide(NodePath.layer),
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe("no-default-export");
    expect(out[0]!.fileGlob).toBe("src/legacy/**");
    expect(out[0]!.reason).toBe("WIP migration");
  });
});
