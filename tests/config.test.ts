import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { buildScreenUrl, outputPath, readPngSize } from "../src/capture.js";
import { resolveFile } from "../src/server.js";
import path from "node:path";

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
