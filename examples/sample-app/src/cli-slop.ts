// Distilled "AI slop" from a real CLI codebase: responsibilities pushed out of
// the type system into untyped bags, message-sniffing, and shape assertions.

const EXIT_INVALID_USAGE = 2;
const EXIT_RUNTIME_FAILURE = 1;

// Untyped object bags instead of real interfaces (no-record-string-unknown).
export type AppActionArgs = Record<string, unknown>;
export type AppActionPayload = Record<string, unknown>;

export function launchApp(args: AppActionArgs): AppActionPayload {
  // Reaching into an untyped bag — the shape lives nowhere the compiler can see.
  const shouldOpen = args.openSimulator !== false;
  const packageName = args.packageName ?? args.bundleId;
  return { packageName, openSimulator: shouldOpen };
}

// Error classification by message-sniffing (no-error-message-matching), with a
// shape assertion onto `unknown` (no-unsafe-object-assertion).
export function exitCodeForError(error: unknown): number {
  const record = error as { exitCode?: unknown; message?: unknown } | null | undefined;
  const explicit = record?.exitCode;
  if (typeof explicit === "number") {
    return explicit;
  }
  const message = String(record?.message ?? "");
  if (/Unknown command|requires a value|valid JSON|mutually exclusive/i.test(message)) {
    return EXIT_INVALID_USAGE;
  }
  return EXIT_RUNTIME_FAILURE;
}
