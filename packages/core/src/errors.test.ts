import { describe, expect, it } from "vitest";
import {
  AmbiguousProjectError,
  NoTypeScriptProjectError,
  ProjectNotFoundError,
  TsDoctorError,
  TsconfigNotFoundError,
  isTsDoctorError,
} from "./errors.js";

describe("tagged errors", () => {
  it("subclasses are instanceof TsDoctorError and Error", () => {
    const e = new NoTypeScriptProjectError("no ts");
    expect(e).toBeInstanceOf(TsDoctorError);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(NoTypeScriptProjectError);
  });

  it("carry a discriminant name and _tag", () => {
    expect(new TsconfigNotFoundError("x").name).toBe("TsconfigNotFoundError");
    expect(new TsconfigNotFoundError("x")._tag).toBe("TsconfigNotFoundError");
    expect(new ProjectNotFoundError("x")._tag).toBe("ProjectNotFoundError");
    expect(new AmbiguousProjectError("x")._tag).toBe("AmbiguousProjectError");
  });

  it("isTsDoctorError narrows correctly", () => {
    expect(isTsDoctorError(new TsDoctorError("x"))).toBe(true);
    expect(isTsDoctorError(new NoTypeScriptProjectError("x"))).toBe(true);
    expect(isTsDoctorError(new Error("x"))).toBe(false);
    expect(isTsDoctorError("x")).toBe(false);
    expect(isTsDoctorError(null)).toBe(false);
  });

  it("preserves cause for chaining", () => {
    const root = new Error("root");
    const e = new TsDoctorError("top", { cause: root });
    expect((e as { cause?: unknown }).cause).toBe(root);
  });
});
