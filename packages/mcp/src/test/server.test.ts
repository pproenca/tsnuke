/**
 * SDK wiring smoke — `createServer()` constructs the `McpServer` and registers the
 * `tools/list` + `tools/call` handlers WITHOUT a zod shape (validation is via
 * `effect/Schema` inside the handler). We don't drive a full stdio transport here (that
 * needs a paired client); we assert the server object builds and exposes the underlying
 * low-level `server` the handlers are registered on. The decode gates themselves are
 * exhaustively covered in `schemas.test.ts`, and the handlers in `tools.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../main/server.js";

describe("createServer — SDK wiring", () => {
  it("constructs an McpServer with a low-level server (no throw)", () => {
    const server = createServer();
    expect(server).toBeInstanceOf(McpServer);
    // The protocol handlers are registered on the underlying low-level `server`.
    expect(server.server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });

  it("does not register tools via the SDK's zod-shape `tool()` path", () => {
    // The authoritative validation is effect/Schema in the request handler, so the
    // SDK's zod-backed tool registry must be empty (we register raw protocol handlers).
    // Probing private SDK state: bridge via `unknown` to the inspection shape.
    const raw: unknown = createServer();
    const server = raw as { _registeredTools: Record<string, unknown> };
    expect(Object.keys(server._registeredTools)).toStrictEqual([]);
  });
});
