/**
 * PRODUCTION-LAYER smoke tests — prove the prod wiring (`NodeContext` =
 * `NodeFileSystem` + `NodePath`) actually reads real disk (the lesson from the config
 * slice review: the whole point of an effectful slice is the Layer wiring every later
 * slice copies, so it must be exercised against a real FS, not only the stub).
 *
 * Everything else in this slice runs against an in-memory stub Layer (NO disk). These
 * 1-2 tests are the ONLY ones touching disk, and they use an OS TEMP dir (never the
 * repo), cleaning up in `finally`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoTypeScriptProjectError } from "@ts-fix/errors-effect";
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { computeCapabilities } from "../main/capabilities.js";
import { discoverTsProject } from "../main/discover.js";
import { collectSourceFiles, countSourceFiles } from "../main/enumerate.js";
import {
  collectSourceFilesNode,
  countSourceFilesNode,
  discoverTsProjectNode,
  NodeContext,
} from "../main/node.js";

describe("PRODUCTION Layer — discoverTsProjectNode reads a REAL temp dir via NodeContext", () => {
  it("discovers a real TS project and computes capabilities end-to-end", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsfix-disc-"));
    try {
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true } }),
      );
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "smoke-lib",
          type: "module",
          exports: { ".": "./index.js" },
          devDependencies: { typescript: "^5.8.0" },
        }),
      );
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "export const x = 1;\n");
      writeFileSync(join(dir, "src", "types.d.ts"), "export {};\n");

      const info = await discoverTsProjectNode(dir);
      expect(info.projectName).toBe("smoke-lib");
      expect(info.projectKind).toBe("lib");
      expect(info.moduleSystem).toBe("esm");
      expect(info.tsVersion).toBe("5.8.0"); // declared range, stripped to M.m.0
      expect(info.strictFlags).toEqual({ strict: true });
      expect(info.sourceFileCount).toBe(1); // a.ts; types.d.ts excluded
      expect(info.typecheckOk).toBe(false); // PENDING

      const caps = computeCapabilities(info);
      expect(caps.has("tsconfig")).toBe(true);
      expect(caps.has("strict")).toBe(true);
      expect(caps.has("lib")).toBe(true);
      expect(caps.has("esm")).toBe(true);
      expect(caps.has("ts:5.8")).toBe(true);
      expect(caps.has("typecheck:ok")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FAILS with NoTypeScriptProjectError on the error channel for a tsconfig-only dir (real NodeContext)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsfix-disc-"));
    try {
      writeFileSync(join(dir, "tsconfig.json"), "{}");
      // Exercise the REAL NodeContext (NodeFileSystem + NodePath), but capture the typed
      // error from the error channel via `Effect.either` rather than the rejecting `*Node`
      // promise (which wraps it in a FiberFailure). This proves the prod Layer surfaces
      // the RULE-022 typed error idiomatically.
      const res = await Effect.runPromise(
        discoverTsProject(dir).pipe(Effect.either, Effect.provide(NodeContext)),
      );
      expect(Either.isLeft(res)).toBe(true);
      if (Either.isLeft(res)) {
        expect(res.left).toBeInstanceOf(NoTypeScriptProjectError);
        expect(res.left._tag).toBe("NoTypeScriptProjectError");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discoverTsProjectNode (rejecting prod runnable) rejects when not a TS project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsfix-disc-"));
    try {
      writeFileSync(join(dir, "tsconfig.json"), "{}");
      // The rejecting runnable wraps the typed failure in a FiberFailure: its `.name`
      // carries the error tag (RULE-037 — reaches the CLI / serializeError) and its
      // `.message` is the verbatim discovery message.
      const caught = await discoverTsProjectNode(dir).then(
        () => undefined,
        (e: unknown) => e as Error,
      );
      expect(caught).toBeInstanceOf(Error);
      expect(caught?.name).toContain("NoTypeScriptProjectError");
      expect(caught?.message).toMatch(/No resolvable 'typescript' dependency/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("countSourceFilesNode / collectSourceFilesNode walk a real temp tree (never reject)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsfix-disc-"));
    try {
      mkdirSync(join(dir, "src"));
      mkdirSync(join(dir, "node_modules"));
      writeFileSync(join(dir, "src", "a.ts"), "");
      writeFileSync(join(dir, "src", "b.tsx"), "");
      writeFileSync(join(dir, "src", "c.d.ts"), "");
      writeFileSync(join(dir, "node_modules", "ignored.ts"), "");

      expect(await countSourceFilesNode(dir)).toBe(2);
      const collected = await collectSourceFilesNode(dir);
      expect([...collected].map((p) => p.replace(dir, "")).sort()).toEqual([
        "/src/a.ts",
        "/src/b.tsx",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honors a small cap against REAL readdir order (RULE-012 truncation; 3 files, cap 2 → 2)", async () => {
    // The cap-truncation path is order-sensitive; this exercises it against the REAL
    // NodeFileSystem readdir (not the in-memory stub's insertion order) — closing the
    // architecture-review H1 gap. Uses the cap-taking Effect directly (the *Node runnables
    // hardcode the default 5000/10000 caps, impractical to hit on disk).
    const dir = mkdtempSync(join(tmpdir(), "tsfix-disc-"));
    try {
      writeFileSync(join(dir, "a.ts"), "");
      writeFileSync(join(dir, "b.ts"), "");
      writeFileSync(join(dir, "c.ts"), "");
      const n = await Effect.runPromise(
        countSourceFiles(dir, 2).pipe(Effect.provide(NodeContext)),
      );
      expect(n).toBe(2);
      const collected = await Effect.runPromise(
        collectSourceFiles(dir, 2).pipe(Effect.provide(NodeContext)),
      );
      expect(collected.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
