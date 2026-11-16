import { readFileSync } from "node:fs";
import { DEVICES } from "./sizes.js";

export type Action =
  | { click: string }
  | { clickAt: [number, number] }
  | { type: string; text: string }
  | { scroll: number }
  | { wait: number };

export interface Screen {
  name: string;
  path?: string;
  waitFor?: number | string;
  actions?: Action[];
  theme?: "light" | "dark";
}

export interface Config {
  url?: string;
  webDir?: string;
  flutterProject?: string;
  outDir: string;
  devices: string[];
  locales: string[];
  readySelector: string;
  settleMs: number;
  enableSemantics: boolean;
  screens: Screen[];
}

const fail = (m: string): never => {
  throw new Error(`Invalid config: ${m}`);
};

export function parseConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("must be a JSON object");
  const r = raw as Record<string, unknown>;
  const sources = ["url", "webDir", "flutterProject"].filter((k) => r[k] !== undefined);
  if (sources.length === 0) fail("one of url, webDir or flutterProject is required");
  for (const k of sources) if (typeof r[k] !== "string" || !r[k]) fail(`${k} must be a non-empty string`);

  const devices = r.devices ?? DEVICES.map((d) => d.name);
  if (!Array.isArray(devices) || devices.length === 0) fail("devices must be a non-empty array");
  for (const d of devices as unknown[]) {
    if (typeof d !== "string" || !DEVICES.some((p) => p.name === d)) {
      fail(`unknown device "${String(d)}". Available: ${DEVICES.map((p) => p.name).join(", ")}`);
    }
  }
  const locales = r.locales ?? ["en-US"];
  if (!Array.isArray(locales) || locales.length === 0 || locales.some((l) => typeof l !== "string")) {
    fail("locales must be a non-empty array of strings");
  }
  if (!Array.isArray(r.screens) || r.screens.length === 0) fail("screens must be a non-empty array");

  const names = new Set<string>();
  const screens = (r.screens as unknown[]).map((s, i): Screen => {
    if (typeof s !== "object" || s === null) return fail(`screens[${i}] must be an object`);
    const o = s as Record<string, unknown>;
    if (typeof o.name !== "string" || !/^[A-Za-z0-9_-]+$/.test(o.name)) {
      fail(`screens[${i}].name is required and may only contain letters, digits, - and _`);
    }
    if (names.has(o.name as string)) fail(`duplicate screen name "${o.name}"`);
    names.add(o.name as string);
    if (o.path !== undefined && typeof o.path !== "string") fail(`screens[${i}].path must be a string`);
    if (o.waitFor !== undefined && typeof o.waitFor !== "number" && typeof o.waitFor !== "string") {
      fail(`screens[${i}].waitFor must be milliseconds or a selector`);
    }
    if (o.theme !== undefined && o.theme !== "light" && o.theme !== "dark") fail(`screens[${i}].theme must be light or dark`);
    if (o.actions !== undefined) {
      if (!Array.isArray(o.actions)) fail(`screens[${i}].actions must be an array`);
      (o.actions as unknown[]).forEach((a, j) => validateAction(a, `screens[${i}].actions[${j}]`));
    }
    return o as unknown as Screen;
  });

  return {
    url: r.url as string | undefined,
    webDir: r.webDir as string | undefined,
    flutterProject: r.flutterProject as string | undefined,
    outDir: typeof r.outDir === "string" ? r.outDir : "screenshots",
    devices: devices as string[],
    locales: locales as string[],
    readySelector: typeof r.readySelector === "string" ? r.readySelector : "flt-glass-pane, flutter-view",
    settleMs: typeof r.settleMs === "number" ? r.settleMs : 1500,
    enableSemantics: r.enableSemantics === true,
    screens,
  };
}

function validateAction(a: unknown, where: string): void {
  if (typeof a !== "object" || a === null) return fail(`${where} must be an object`);
  const o = a as Record<string, unknown>;
  if ("click" in o) {
    if (typeof o.click !== "string") fail(`${where}.click must be a string`);
  } else if ("clickAt" in o) {
    const c = o.clickAt;
    if (!Array.isArray(c) || c.length !== 2 || c.some((n) => typeof n !== "number")) fail(`${where}.clickAt must be [x, y]`);
  } else if ("type" in o) {
    if (typeof o.type !== "string" || typeof o.text !== "string") fail(`${where} needs string type (selector) and text`);
  } else if ("scroll" in o) {
    if (typeof o.scroll !== "number") fail(`${where}.scroll must be a number`);
  } else if ("wait" in o) {
    if (typeof o.wait !== "number") fail(`${where}.wait must be a number`);
  } else fail(`${where} must have one of click, clickAt, type, scroll, wait`);
}

export function loadConfig(file: string): Config {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`Cannot read config file ${file}. Run "flutter-screenshots init" to create one.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Config ${file} is not valid JSON: ${(e as Error).message}`);
  }
  return parseConfig(json);
}
