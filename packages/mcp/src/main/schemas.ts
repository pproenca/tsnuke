/**
 * RULE-029 — MCP tool input validation, as `effect/Schema` (the slice DEVIATION).
 *
 * Legacy validated each tool's arguments with a **zod** raw shape passed to the MCP
 * SDK's `server.tool(name, desc, shape, handler)` (`packages/mcp/src/server.ts:24-56`).
 * This slice replaces zod with `effect/Schema` — the single validation library across
 * the modernized codebase — and makes the Schema the AUTHORITATIVE gate:
 *
 *   - The 3 tools' input shapes are `Schema.Struct`s here (one per tool).
 *   - `decode*` are `Schema.decodeUnknownEither` decoders: the server runs them on the
 *     raw incoming `arguments` BEFORE dispatching to the pure handler, returning an MCP
 *     `InvalidParams` error on a `Left` (a faithful equivalent of the SDK's zod gate,
 *     and of RULE-029's "validate before dispatch" spec). The handlers in `tools.ts`
 *     continue to assume already-validated args (legacy invariant preserved).
 *   - `*JsonSchema` are JSON Schemas DERIVED from the same Schema via `JSONSchema.make`,
 *     used purely for tool DISCOVERY (the `tools/list` response) so an agent sees the
 *     parameter contract. They are advisory metadata; the Schema decode is the gate.
 *
 * Field contract (frozen by RULE-029):
 *   - `tsnuke_diagnose`   : { directory: string, deep?: boolean }
 *   - `tsnuke_explain`    : { rule: string }
 *   - `tsnuke_list_rules` : {}
 *
 * Field-level `.annotations({ description })` flow into the generated JSON Schema as
 * `description` metadata an agent reads in `tools/list` — additive only. A TOP-LEVEL
 * `identifier` is DELIBERATELY OMITTED: `JSONSchema.make` would then emit a `$ref`/`$defs`
 * wrapper instead of the inline `{ type: "object", required, properties }` shape the MCP
 * `inputSchema` contract requires, breaking agent integrations. So the wire contract stays
 * byte-stable (`required`/`type` unchanged; only `description` keys are added).
 *
 * zod is GONE: it is not imported here, anywhere in this slice, nor a dependency.
 */
import { JSONSchema, Schema } from "effect";

// ---------------------------------------------------------------------------
// tsnuke_diagnose — { directory: string, deep?: boolean }
// ---------------------------------------------------------------------------

export const DiagnoseArgs = Schema.Struct({
  directory: Schema.String.annotations({
    description: "Path to the TypeScript project (or monorepo root) to lint and score.",
  }),
  deep: Schema.optional(
    Schema.Boolean.annotations({
      description: "Run the type-aware tier (Tier-2). Slower; needs a clean typecheck.",
    }),
  ),
});
export type DiagnoseArgs = typeof DiagnoseArgs.Type;

/** Authoritative decode for `tsnuke_diagnose` args (RULE-029). Returns `Either`. */
export const decodeDiagnoseArgs = Schema.decodeUnknownEither(DiagnoseArgs);

// ---------------------------------------------------------------------------
// tsnuke_explain — { rule: string }
// ---------------------------------------------------------------------------

export const ExplainArgs = Schema.Struct({
  rule: Schema.String.annotations({
    description: "The rule id to explain, e.g. `no-explicit-any` or `no-import-cycles`.",
  }),
});
export type ExplainArgs = typeof ExplainArgs.Type;

/** Authoritative decode for `tsnuke_explain` args (RULE-029). Returns `Either`. */
export const decodeExplainArgs = Schema.decodeUnknownEither(ExplainArgs);

// ---------------------------------------------------------------------------
// tsnuke_list_rules — {}
// ---------------------------------------------------------------------------

export const ListRulesArgs = Schema.Struct({});
export type ListRulesArgs = typeof ListRulesArgs.Type;

/** Authoritative decode for `tsnuke_list_rules` args (RULE-029). Returns `Either`. */
export const decodeListRulesArgs = Schema.decodeUnknownEither(ListRulesArgs);

// ---------------------------------------------------------------------------
// JSON Schemas derived from the SAME effect/Schema, for tool DISCOVERY only.
// ---------------------------------------------------------------------------

/** JSON Schema for `tsnuke_diagnose` (advisory `tools/list` metadata). */
export const DiagnoseJsonSchema = JSONSchema.make(DiagnoseArgs);
/** JSON Schema for `tsnuke_explain` (advisory `tools/list` metadata). */
export const ExplainJsonSchema = JSONSchema.make(ExplainArgs);
/** JSON Schema for `tsnuke_list_rules` (advisory `tools/list` metadata). */
export const ListRulesJsonSchema = JSONSchema.make(ListRulesArgs);
