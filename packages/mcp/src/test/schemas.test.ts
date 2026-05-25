/**
 * RULE-029 — the MCP tool input-validation contract, now enforced by `effect/Schema`
 * (the zod replacement). For each tool we assert the `Schema.decodeUnknownEither` decode
 * ACCEPTS valid args (`Right`) and REJECTS invalid ones (`Left`):
 *   - `tsnuke_diagnose`   : { directory: string, deep?: boolean }
 *   - `tsnuke_explain`    : { rule: string }
 *   - `tsnuke_list_rules` : {}
 *
 * Also confirms the JSON Schemas derived from the same Schema advertise the right
 * required fields, and (the load-bearing deviation invariant) that zod is imported
 * NOWHERE in this slice's source.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Either } from "effect";
import { describe, expect, it } from "vitest";
import {
  decodeDiagnoseArgs,
  decodeExplainArgs,
  decodeListRulesArgs,
  DiagnoseJsonSchema,
  ExplainJsonSchema,
  ListRulesJsonSchema,
} from "../main/schemas.js";

describe("RULE-029 — tsnuke_diagnose args { directory: string, deep?: boolean }", () => {
  it("ACCEPTS { directory } (deep omitted)", () => {
    const r = decodeDiagnoseArgs({ directory: "/repo" });
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) {
      expect(r.right.directory).toBe("/repo");
      expect(r.right.deep).toBeUndefined();
    }
  });

  it("ACCEPTS { directory, deep: true }", () => {
    const r = decodeDiagnoseArgs({ directory: "/repo", deep: true });
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) expect(r.right.deep).toBe(true);
  });

  it("REJECTS missing directory", () => {
    expect(Either.isLeft(decodeDiagnoseArgs({}))).toBe(true);
    expect(Either.isLeft(decodeDiagnoseArgs({ deep: true }))).toBe(true);
  });

  it("REJECTS non-string directory", () => {
    expect(Either.isLeft(decodeDiagnoseArgs({ directory: 42 }))).toBe(true);
  });

  it("REJECTS non-boolean deep", () => {
    expect(Either.isLeft(decodeDiagnoseArgs({ directory: "/repo", deep: "yes" }))).toBe(
      true,
    );
  });

  it("REJECTS a non-object payload", () => {
    expect(Either.isLeft(decodeDiagnoseArgs(null))).toBe(true);
    expect(Either.isLeft(decodeDiagnoseArgs("nope"))).toBe(true);
  });
});

describe("RULE-029 — tsnuke_explain args { rule: string }", () => {
  it("ACCEPTS { rule: string }", () => {
    const r = decodeExplainArgs({ rule: "no-explicit-any" });
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) expect(r.right.rule).toBe("no-explicit-any");
  });

  it("REJECTS missing rule", () => {
    expect(Either.isLeft(decodeExplainArgs({}))).toBe(true);
  });

  it("REJECTS non-string rule", () => {
    expect(Either.isLeft(decodeExplainArgs({ rule: 123 }))).toBe(true);
    expect(Either.isLeft(decodeExplainArgs({ rule: null }))).toBe(true);
  });
});

describe("RULE-029 — tsnuke_list_rules args {}", () => {
  it("ACCEPTS {} (no params)", () => {
    expect(Either.isRight(decodeListRulesArgs({}))).toBe(true);
  });

  it("ACCEPTS extra fields (struct is non-exhaustive by default)", () => {
    // Mirrors the legacy zod `{}` shape, which ignored unknown keys.
    expect(Either.isRight(decodeListRulesArgs({ extra: 1 }))).toBe(true);
  });

  it("REJECTS a nullish payload (no arguments at all)", () => {
    // The meaningful RULE-029 invariant for a no-param tool: an absent/nullish payload
    // is rejected. effect/Schema's empty `Struct({})` is a "non-nullish" record check, so
    // a bare primitive like `7` decodes as `Right` (it carries no required keys to fail);
    // `null`/`undefined` are the rejected cases.
    expect(Either.isLeft(decodeListRulesArgs(null))).toBe(true);
    expect(Either.isLeft(decodeListRulesArgs(undefined))).toBe(true);
  });
});

describe("JSON Schemas derived from the effect/Schema (tool discovery)", () => {
  it("tsnuke_diagnose requires `directory`, allows optional `deep`", () => {
    const js = DiagnoseJsonSchema as { required?: string[]; properties?: object };
    expect(js.required).toStrictEqual(["directory"]);
    expect(js.properties).toHaveProperty("directory");
    expect(js.properties).toHaveProperty("deep");
  });

  it("tsnuke_explain requires `rule`", () => {
    const js = ExplainJsonSchema as { required?: string[] };
    expect(js.required).toStrictEqual(["rule"]);
  });

  it("tsnuke_list_rules has no required fields", () => {
    const js = ListRulesJsonSchema as { required?: string[] };
    expect(js.required ?? []).toStrictEqual([]);
  });
});

describe("zod is GONE — no source file imports it", () => {
  it("no `from \"zod\"` / require('zod') anywhere under src/main", () => {
    const mainDir = fileURLToPath(new URL("../main", import.meta.url));
    const offenders: string[] = [];
    for (const file of readdirSync(mainDir)) {
      if (!file.endsWith(".ts")) continue;
      const text = readFileSync(join(mainDir, file), "utf8");
      if (/from\s+["']zod["']|require\(\s*["']zod["']\s*\)|import\s+["']zod["']/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toStrictEqual([]);
  });
});
