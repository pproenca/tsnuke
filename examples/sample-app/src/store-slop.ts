// More distilled "AI slop" (from a real state/debug command): an interface that
// extends an untyped bag, functions that return `unknown`, and guard-then-cast.

// Extending the untyped bag (no-record-string-unknown, heritage form).
export interface StateRootArgs extends Record<string, unknown> {
  root?: string | null;
}

// Returning `unknown` pushes narrowing onto every caller (no-unknown-return).
export async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(file);
}

export function firstPositional(args: { _?: unknown }): unknown {
  return Array.isArray(args._) ? args._[0] : undefined;
}

interface RecordLike {
  sessionId?: unknown;
}
interface SessionRecord {
  sessionId: string;
}

// Runtime checks immediately followed by casts — the checks don't narrow, so the
// shape is asserted by hand (no-cast-after-guard ×2).
export function asSessionRecord(value: unknown): SessionRecord | null {
  const record = value && typeof value === "object" ? (value as RecordLike) : null;
  return typeof record?.sessionId === "string" ? (record as SessionRecord) : null;
}
