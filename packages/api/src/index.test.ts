import { describe, expect, it } from "vitest";
import * as api from "./index.js";

describe("@ts-doctor/api surface", () => {
  it("re-exports the diagnose() function", () => {
    expect(typeof api.diagnose).toBe("function");
  });

  it("re-exports the error classes", () => {
    expect(typeof api.NoTypeScriptProjectError).toBe("function");
    expect(typeof api.isTsDoctorError).toBe("function");
  });
});
