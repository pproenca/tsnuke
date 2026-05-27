/**
 * Progress streaming — assert the engine emits the documented phase events in
 * the documented order, and never throws if the renderer does.
 */

import { Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnose, type ProgressEvent } from "../main/index.js";

const makeProject = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "tsnuke-progress-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, target: "ES2022" } }),
  );
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, "src", name), body);
  }
  return dir;
};

describe("progress streaming", () => {
  it("emits the expected phase sequence for a normal typechecking project", async () => {
    const dir = makeProject({ "a.ts": "export const x: number = 1;\n" });
    try {
      const events: ProgressEvent[] = [];
      await Effect.runPromise(
        Effect.scoped(diagnose(dir, { onProgress: (e) => events.push(e) })).pipe(
          Effect.provide(NodeContext.layer),
        ),
      );
      const kinds = events.map((e) => e.kind);
      expect(kinds[0]).toBe("discovered");
      expect(kinds).toContain("reading-files");
      expect(kinds).toContain("building-program");
      expect(kinds).toContain("tier-1");
      expect(kinds).toContain("tier-2");
      expect(kinds).toContain("scoring");
      expect(kinds[kinds.length - 1]).toBe("done");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits tier-2-skipped instead of tier-2 when deep=false", async () => {
    const dir = makeProject({ "a.ts": "export const x: number = 1;\n" });
    try {
      const events: ProgressEvent[] = [];
      await Effect.runPromise(
        Effect.scoped(diagnose(dir, { deep: false, onProgress: (e) => events.push(e) })).pipe(
          Effect.provide(NodeContext.layer),
        ),
      );
      const kinds = events.map((e) => e.kind);
      expect(kinds).toContain("tier-2-skipped");
      expect(kinds).not.toContain("tier-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a throwing renderer never poisons the engine", async () => {
    const dir = makeProject({ "a.ts": "export const x: number = 1;\n" });
    try {
      const result = await Effect.runPromise(
        Effect.scoped(
          diagnose(dir, {
            onProgress: () => {
              throw new Error("boom");
            },
          }),
        ).pipe(Effect.provide(NodeContext.layer)),
      );
      expect(result.score?.score).toBeTypeOf("number");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
