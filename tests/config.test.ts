import { describe, expect, it } from "vitest";
import { defaultConfig, parseConfig, themesFor, screenNeedsLogin } from "../src/config.js";
import { buildScreenUrl, headersForRequest, outputPath, readPngSize, resolveAction, substituteEnv } from "../src/capture.js";
import { resolveFile } from "../src/server.js";
import path from "node:path";
import fs from "node:fs";

const ok = { url: "http://x", screens: [{ name: "home" }] };

describe("parseConfig", () => {
  it("applies defaults", () => {
    const c = parseConfig(ok);
    expect(c.outDir).toBe("screenshots");
    expect(c.locales).toEqual(["en-US"]);
    expect(c.devices.length).toBeGreaterThan(0);
  });
  it("requires a source", () => expect(() => parseConfig({ screens: [{ name: "a" }] })).toThrow(/url, webDir/));
  it("rejects unknown device", () => expect(() => parseConfig({ ...ok, devices: ["x"] })).toThrow(/unknown device/));
  it("rejects bad screen name", () => expect(() => parseConfig({ url: "u", screens: [{ name: "a/b" }] })).toThrow(/name/));
  it("rejects duplicate names", () => expect(() => parseConfig({ url: "u", screens: [{ name: "a" }, { name: "a" }] })).toThrow(/duplicate/));
  it("rejects bad action", () => expect(() => parseConfig({ url: "u", screens: [{ name: "a", actions: [{ foo: 1 }] }] })).toThrow(/actions\[0\]/));
  it("accepts actions", () => {
    parseConfig({ url: "u", screens: [{ name: "a", actions: [{ click: "x" }, { clickAt: [1, 2] }, { wait: 5 }, { scroll: 3 }, { type: "input", text: "t" }] }] });
  });
});

describe("capture helpers", () => {
  it("builds output path", () => expect(outputPath("out", "apple", "iphone-6.9", "en-US", 0, "home")).toBe(path.join("out", "apple", "iphone-6.9", "en-US", "01-home.png")));
  it("builds urls", () => {
    expect(buildScreenUrl("http://h:1/", "#/s")).toBe("http://h:1/#/s");
    expect(buildScreenUrl("http://h:1/", "/a/b")).toBe("http://h:1/a/b");
    expect(buildScreenUrl("http://h:1/", undefined)).toBe("http://h:1/");
  });
  it("reads png size", () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(10, 16);
    b.writeUInt32BE(20, 20);
    expect(readPngSize(b)).toEqual({ width: 10, height: 20 });
  });
});

describe("resolveFile", () => {
  it("blocks traversal", () => expect(resolveFile(path.resolve("examples/demo-app"), "/../../package.json")).toBeNull());
  it("serves existing file", () => expect(resolveFile(path.resolve("examples/demo-app"), "/index.html")).not.toBeNull());
});

describe("theme config", () => {
  it("defaults to light", () => expect(parseConfig(ok).theme).toBe("light"));
  it("accepts both", () => expect(parseConfig({ ...ok, theme: "both" }).theme).toBe("both"));
  it("rejects bad theme", () => expect(() => parseConfig({ ...ok, theme: "blue" })).toThrow(/theme must be/));
  it("themesFor honors mode and per-screen override", () => {
    expect(themesFor({ theme: "both" }, {})).toEqual(["light", "dark"]);
    expect(themesFor({ theme: "dark" }, {})).toEqual(["dark"]);
    expect(themesFor({ theme: "both" }, { theme: "dark" })).toEqual(["dark"]);
  });
  it("adds theme suffix to output path", () => {
    expect(outputPath("o", "apple", "d", "en-US", 1, "home", "dark")).toBe(path.join("o", "apple", "d", "en-US", "02-home-dark.png"));
  });
});

describe("login config", () => {
  const login = { actions: [{ type: "#u", text: "${SCREENSHOT_USER}" }] };
  it("accepts login and requiresLogin", () => {
    const c = parseConfig({ url: "u", login, screens: [{ name: "a", requiresLogin: true }, { name: "b" }] });
    expect(screenNeedsLogin(c, c.screens[0])).toBe(true);
    expect(screenNeedsLogin(c, c.screens[1])).toBe(false);
  });
  it("allScreens applies to every screen", () => {
    const c = parseConfig({ url: "u", login: { ...login, allScreens: true }, screens: [{ name: "a" }] });
    expect(screenNeedsLogin(c, c.screens[0])).toBe(true);
  });
  it("accepts storageState only", () => {
    parseConfig({ url: "u", login: { storageState: "auth.json" }, screens: [{ name: "a" }] });
  });
  it("rejects empty login", () => expect(() => parseConfig({ url: "u", login: {}, screens: [{ name: "a" }] })).toThrow(/login needs/));
  it("rejects bad login action", () => {
    expect(() => parseConfig({ url: "u", login: { actions: [{ nope: 1 }] }, screens: [{ name: "a" }] })).toThrow(/login.actions\[0\]/);
  });
  it("rejects requiresLogin without login", () => {
    expect(() => parseConfig({ url: "u", screens: [{ name: "a", requiresLogin: true }] })).toThrow(/needs a top-level login/);
  });
  it("rejects non-string headers", () => {
    expect(() => parseConfig({ url: "u", login: { headers: { a: 1 } }, screens: [{ name: "a" }] })).toThrow(/headers/);
  });
});

describe("env substitution", () => {
  it("replaces variables", () => expect(substituteEnv("a-${X}-${Y}", { X: "1", Y: "2" })).toBe("a-1-2"));
  it("leaves plain text alone", () => expect(substituteEnv("plain $ {X}", {})).toBe("plain $ {X}"));
  it("names the missing variable but no values", () => {
    expect(() => substituteEnv("${SCREENSHOT_PASSWORD}", { SCREENSHOT_USER: "secret" })).toThrow(/SCREENSHOT_PASSWORD is not set/);
  });
  it("resolves action strings", () => {
    expect(resolveAction({ type: "#u", text: "${U}" }, { U: "bob" })).toEqual({ type: "#u", text: "bob" });
    expect(resolveAction({ wait: 5 })).toEqual({ wait: 5 });
  });
});

describe("defaultConfig", () => {
  it("builds a usable config from a url", () => {
    const c = defaultConfig({ url: "http://x" });
    expect(c.url).toBe("http://x");
    expect(c.screens.map((s) => s.name)).toEqual(["home"]);
    expect(c.enableSemantics).toBe(true);
    expect(c.devices.length).toBeGreaterThan(3);
    expect(c.locales).toEqual(["en-US"]);
  });
  it("accepts webDir", () => expect(defaultConfig({ webDir: "build/web" }).webDir).toBe("build/web"));
  it("needs a source", () => expect(() => defaultConfig({})).toThrow(/url, webDir/));
});

describe("headersForRequest", () => {
  it("adds headers for the app origin only", () => {
    expect(headersForRequest("http://h:1/a.js", "http://h:1/", { Authorization: "x" }, { a: "b" })).toEqual({ a: "b", Authorization: "x" });
    expect(headersForRequest("https://www.gstatic.com/f.js", "http://h:1/", { Authorization: "x" })).toBeUndefined();
  });
});

describe("example configs", () => {
  const files = fs.readdirSync(".").filter((f) => /^screenshots\.config\..*\.json$/.test(f));
  it.each(files)("%s parses", (f) => {
    const c = parseConfig(JSON.parse(fs.readFileSync(f, "utf8")));
    expect(c.screens.length).toBeGreaterThan(0);
    expect(fs.readFileSync(f, "utf8")).not.toMatch(/password"\s*:\s*"(?!\$\{)/i);
  });
});
