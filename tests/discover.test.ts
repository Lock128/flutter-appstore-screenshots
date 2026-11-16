import { describe, expect, it } from "vitest";
import { formatSkipped, hashBuffer, registerScreen, shortError, slugify, uniqueName } from "../src/discover.js";
import { defaultConfig, parseConfig } from "../src/config.js";

describe("discover helpers", () => {
  it("slugifies labels", () => {
    expect(slugify("Get started!", "x")).toBe("get-started");
    expect(slugify("  Über uns / Team ", "x")).toBe("uber-uns-team");
    expect(slugify("!!!", "screen-3")).toBe("screen-3");
    expect(slugify("a".repeat(50), "x").length).toBeLessThanOrEqual(30);
  });
  it("makes names unique", () => {
    const used = new Set(["home"]);
    expect(uniqueName("Home", "f", used)).toBe("home-2");
    expect(uniqueName("Home", "f", used)).toBe("home-3");
  });
  it("detects new screens by url or image", () => {
    const seen = new Set<string>();
    const h1 = hashBuffer(Buffer.from("a"));
    expect(registerScreen(seen, "http://x/#/", h1)).toBe(true);
    expect(registerScreen(seen, "http://x/#/", h1)).toBe(false);
    expect(registerScreen(seen, "http://x/#/b", h1)).toBe(true);
    expect(registerScreen(seen, "http://x/#/", hashBuffer(Buffer.from("b")))).toBe(true);
  });
  it("formats skipped elements and short errors", () => {
    expect(formatSkipped([{ label: "", reason: "r" }, { label: "Go", reason: "q" }])).toEqual(["  - (no label): r", "  - Go: q"]);
    expect(shortError(new Error("first\nsecond"))).toBe("first");
  });
});

describe("resilience config", () => {
  const base = { url: "http://x", screens: [{ name: "home" }] };
  it("has defaults", () => {
    const c = parseConfig(base);
    expect(c).toMatchObject({ navigationTimeoutMs: 60000, actionTimeoutMs: 10000, retries: 2, discover: false, maxScreens: 10 });
  });
  it("accepts overrides and rejects bad values", () => {
    expect(parseConfig({ ...base, navigationTimeoutMs: 5, discover: true, maxScreens: 3, retries: 0 })).toMatchObject({ navigationTimeoutMs: 5, discover: true, maxScreens: 3, retries: 0 });
    expect(() => parseConfig({ ...base, actionTimeoutMs: 0 })).toThrow(/actionTimeoutMs/);
    expect(() => parseConfig({ ...base, maxScreens: 0 })).toThrow(/maxScreens/);
    expect(() => parseConfig({ ...base, retries: -1 })).toThrow(/retries/);
    expect(() => parseConfig({ ...base, discover: "yes" })).toThrow(/discover/);
  });
  it("default config uses discovery and only a text-free home screen", () => {
    const c = defaultConfig({ url: "http://x" });
    expect(c.discover).toBe(true);
    expect(c.screens).toEqual([{ name: "home" }]);
  });
});
