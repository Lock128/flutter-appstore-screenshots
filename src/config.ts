import { readFileSync } from "node:fs";
import path from "node:path";
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
  /** Capture this screen signed in (requires a top-level login config). */
  requiresLogin?: boolean;
}

export type ThemeMode = "light" | "dark" | "both";

export interface Login {
  /** Page to open before running the login actions (defaults to the app root). */
  path?: string;
  /** Actions that perform the login. Strings may contain ${ENV_VAR}. */
  actions?: Action[];
  /** Milliseconds or selector to wait for after the login actions. */
  waitFor?: number | string;
  /** Playwright storage state JSON (cookies, localStorage) of an already signed-in session. */
  storageState?: string;
  /** Extra HTTP headers sent with every request, e.g. Authorization. May contain ${ENV_VAR}. */
  headers?: Record<string, string>;
  /** Treat every screen as requiring login (default false). */
  allScreens?: boolean;
}

export interface Config {
  url?: string;
  webDir?: string;
  flutterProject?: string;
  /** Free-form info about the app (repo, project path, URL). Ignored by the tool. */
  metadata?: Record<string, unknown>;
  outDir: string;
  devices: string[];
  locales: string[];
  readySelector: string;
  settleMs: number;
  enableSemantics: boolean;
  /** Max time for page navigation and for the app to become ready (ms). */
  navigationTimeoutMs: number;
  /** Max time for each click, type or wait-for-selector step (ms). */
  actionTimeoutMs: number;
  /** Extra attempts when opening a page fails. */
  retries: number;
  /** Discovery mode: click through clickable elements and capture each new screen. */
  discover: boolean;
  /** Maximum number of screens to capture in discovery mode, including the start screen. */
  maxScreens: number;
  theme: ThemeMode;
  login?: Login;
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
  for (const k of ["navigationTimeoutMs", "actionTimeoutMs"]) {
    if (r[k] !== undefined && (typeof r[k] !== "number" || !(r[k] as number > 0))) fail(`${k} must be a positive number`);
  }
  if (r.retries !== undefined && (!Number.isInteger(r.retries) || (r.retries as number) < 0)) fail("retries must be a non-negative integer");
  if (r.discover !== undefined && typeof r.discover !== "boolean") fail("discover must be a boolean");
  if (r.maxScreens !== undefined && (!Number.isInteger(r.maxScreens) || (r.maxScreens as number) < 1)) fail("maxScreens must be a positive integer");
  if (r.theme !== undefined && !isThemeMode(r.theme)) fail("theme must be light, dark or both");
  const login = r.login === undefined ? undefined : parseLogin(r.login);
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
    if (o.requiresLogin !== undefined && typeof o.requiresLogin !== "boolean") fail(`screens[${i}].requiresLogin must be a boolean`);
    if (o.requiresLogin === true && !login) fail(`screens[${i}].requiresLogin needs a top-level login config`);
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
    navigationTimeoutMs: (r.navigationTimeoutMs as number | undefined) ?? 60_000,
    actionTimeoutMs: (r.actionTimeoutMs as number | undefined) ?? 10_000,
    retries: (r.retries as number | undefined) ?? 2,
    discover: r.discover === true,
    maxScreens: (r.maxScreens as number | undefined) ?? 10,
    theme: (r.theme as ThemeMode | undefined) ?? "light",
    login,
    screens,
  };
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "both";
}

function parseLogin(raw: unknown): Login {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("login must be an object");
  const o = raw as Record<string, unknown>;
  if (o.path !== undefined && typeof o.path !== "string") fail("login.path must be a string");
  if (o.waitFor !== undefined && typeof o.waitFor !== "number" && typeof o.waitFor !== "string") {
    fail("login.waitFor must be milliseconds or a selector");
  }
  if (o.storageState !== undefined && (typeof o.storageState !== "string" || !o.storageState)) {
    fail("login.storageState must be a file path");
  }
  if (o.allScreens !== undefined && typeof o.allScreens !== "boolean") fail("login.allScreens must be a boolean");
  if (o.actions !== undefined) {
    if (!Array.isArray(o.actions)) fail("login.actions must be an array");
    (o.actions as unknown[]).forEach((a, j) => validateAction(a, `login.actions[${j}]`));
  }
  if (o.headers !== undefined) {
    const h = o.headers;
    if (typeof h !== "object" || h === null || Array.isArray(h) || Object.values(h).some((v) => typeof v !== "string")) {
      fail("login.headers must be an object of strings");
    }
  }
  if (!o.storageState && !(Array.isArray(o.actions) && o.actions.length) && !o.headers) {
    fail("login needs actions, storageState or headers");
  }
  return o as unknown as Login;
}

/** Themes to capture for a screen. A per-screen theme overrides the global mode. */
export function themesFor(config: Pick<Config, "theme">, screen: Pick<Screen, "theme">): Array<"light" | "dark"> {
  if (screen.theme) return [screen.theme];
  return config.theme === "both" ? ["light", "dark"] : [config.theme];
}

export function screenNeedsLogin(config: Pick<Config, "login">, screen: Pick<Screen, "requiresLogin">): boolean {
  return !!config.login && (screen.requiresLogin ?? config.login.allScreens ?? false);
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

/**
 * Built-in config used when no config file exists: all devices, semantics on, discovery mode on.
 * The only fixed screen is "home" (the start route); the rest is found by clicking, so nothing
 * depends on text that may not exist in the app.
 */
export function defaultConfig(source: { url?: string; webDir?: string }): Config {
  return parseConfig({ ...source, enableSemantics: true, discover: true, screens: [{ name: "home" }] });
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
  const config = parseConfig(json);
  // A relative storageState is relative to the config file, whichever way the tool is started.
  if (config.login?.storageState) config.login.storageState = path.resolve(path.dirname(file), config.login.storageState);
  return config;
}
