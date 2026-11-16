import { describe, expect, it } from "vitest";
import { DEVICES, findDevice, viewportFor } from "../src/sizes.js";

describe("sizes", () => {
  it.each(DEVICES.map((d) => [d.name, d] as const))("%s yields exact store pixels", (_n, d) => {
    const v = viewportFor(d);
    expect(Number.isInteger(v.width)).toBe(true);
    expect(Number.isInteger(v.height)).toBe(true);
    expect(v.width * d.scale).toBe(d.width);
    expect(v.height * d.scale).toBe(d.height);
  });
  it("has unique names", () => {
    expect(new Set(DEVICES.map((d) => d.name)).size).toBe(DEVICES.length);
  });
  it("rejects unknown device", () => {
    expect(() => findDevice("nope")).toThrow(/Available/);
  });
});
