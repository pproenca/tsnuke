import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-singleton-class.js";

describe("no-singleton-class (SYN)", () => {
  it("flags the canonical Singleton class (private static instance + static getInstance)", () => {
    const code = `
class Logger {
  private static instance: Logger | null = null;
  private constructor(private readonly tag: string) {}
  static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger("default");
    return Logger.instance;
  }
}
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-singleton-class");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.message).toContain("Logger");
    expect(diags[0]!.message).toContain("Singleton");
  });

  it("flags the lazy `??=` variant (this.instance ??= new X)", () => {
    const code = `
class Db {
  private static instance: Db;
  static get(): Db {
    return Db.instance ??= new Db();
  }
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags a class even when the field is named differently", () => {
    const code = `
class Cache {
  private static _self: Cache | null = null;
  static get(): Cache {
    return this._self ??= new Cache();
  }
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag an ordinary class with a static counter", () => {
    const code = `
class Counter {
  private static count: number = 0;
  static next(): number {
    return ++Counter.count;
  }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a class without a static accessor returning the self field", () => {
    const code = `
class Foo {
  private static instance: Foo | null = null;
  static reset(): void {
    Foo.instance = null;
  }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a `public static defaultInstance` (named-instance, not Singleton)", () => {
    const code = `
class Defaults {
  public static defaultInstance: Defaults = new Defaults();
  static of(): Defaults { return Defaults.defaultInstance; }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags a `protected static instance` Singleton (encapsulated)", () => {
    const code = `
class Base {
  protected static instance: Base | null = null;
  static get(): Base { return Base.instance ??= new Base(); }
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `return (X.instance ??= new X())` (parenthesized lazy init)", () => {
    const code = `
class Db {
  private static instance: Db | null = null;
  static get(): Db {
    return (Db.instance ??= new Db());
  }
}
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags a Singleton declared as a class expression (L1: `const X = class X { … }`)", () => {
    const code = `
const Logger = class Logger {
  private static instance: Logger | null = null;
  static getInstance(): Logger {
    return Logger.instance ??= new Logger();
  }
};
`;
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("Logger");
  });

  it("flags a Singleton class expression named via its binding variable", () => {
    const code = `
const Db = class {
  private static instance: Db | null = null;
  static get(): Db { return Db.instance ??= new Db(); }
};
`;
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a class with no static self-typed field", () => {
    const code = `
class Bus {
  private listeners: ((m: string) => void)[] = [];
  static getInstance(): Bus { return new Bus(); }
}
`;
    expect(runRule(rule, code)).toHaveLength(0);
  });
});
