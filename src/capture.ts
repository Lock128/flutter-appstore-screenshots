import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { screenNeedsLogin, themesFor, type Action, type Config, type Screen } from "./config.js";
import { findDevice, viewportFor } from "./sizes.js";

export function readPngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function outputPath(outDir: string, store: string, device: string, locale: string, index: number, name: string, theme?: string): string {
  const suffix = theme ? `-${theme}` : "";
  return path.join(outDir, store, device, locale, `${String(index + 1).padStart(2, "0")}-${name}${suffix}.png`);
}

/** Replace ${VAR} with environment values. Throws naming the variable (never its value) if unset. */
export function substituteEnv(text: string, env: Record<string, string | undefined> = process.env): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    const v = env[name];
    if (v === undefined || v === "") throw new Error(`Environment variable ${name} is not set (referenced in config)`);
    return v;
  });
}

/** Return a copy of the action with env substitution applied to every string field. */
export function resolveAction(a: Action, env: Record<string, string | undefined> = process.env): Action {
  if ("click" in a) return { click: substituteEnv(a.click, env) };
  if ("type" in a) return { type: substituteEnv(a.type, env), text: substituteEnv(a.text, env) };
  return a;
}

export function buildScreenUrl(base: string, p?: string): string {
  if (!p) return base;
  if (p.startsWith("#")) return base.replace(/#.*$/, "") + p;
  return new URL(p.replace(/^\//, ""), base.endsWith("/") ? base : base + "/").toString();
}

async function runAction(page: Page, a: Action): Promise<void> {
  if ("click" in a) {
    // Plain text first (Flutter canvas apps need semantics), otherwise treat as a selector
    const loc = a.click.startsWith("text=") || /^[.#\[]|[>\s]/.test(a.click) ? page.locator(a.click) : page.getByText(a.click);
    await loc.first().click();
  } else if ("clickAt" in a) {
    await page.mouse.click(a.clickAt[0], a.clickAt[1]);
  } else if ("type" in a) {
    await page.locator(a.type).first().fill(a.text);
  } else if ("scroll" in a) {
    await page.mouse.move(100, 300);
    await page.mouse.wheel(0, a.scroll);
  } else {
    await page.waitForTimeout(a.wait);
  }
}

async function openReady(page: Page, config: Config, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(config.readySelector, { timeout: 60_000 });
  if (config.enableSemantics) {
    await page.locator("flt-semantics-placeholder").evaluate((el) => (el as HTMLElement).click(), undefined, { timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(config.settleMs);
}

async function waitForSpec(page: Page, spec: number | string | undefined): Promise<void> {
  if (typeof spec === "string") await page.waitForSelector(spec, { timeout: 30_000 });
  else if (typeof spec === "number") await page.waitForTimeout(spec);
}

async function performLogin(page: Page, config: Config, baseUrl: string): Promise<void> {
  const login = config.login!;
  const actions = (login.actions ?? []).map((a) => resolveAction(a));
  if (actions.length === 0) return;
  await openReady(page, config, buildScreenUrl(baseUrl, login.path));
  for (let i = 0; i < actions.length; i++) {
    try {
      await runAction(page, actions[i]);
    } catch {
      // Do not include the underlying error: it can echo typed values.
      throw new Error(`Login failed at login.actions[${i}]. Check the selector and that the login page is reachable.`);
    }
  }
  try {
    await waitForSpec(page, login.waitFor);
  } catch {
    throw new Error("Login did not complete: login.waitFor was not satisfied. Check the credentials.");
  }
  await page.waitForTimeout(500);
}

export async function capture(config: Config, baseUrl: string, log: (m: string) => void = console.log): Promise<string[]> {
  const login = config.login;
  // Fail early (before launching a browser) if a referenced env var is missing.
  if (login && config.screens.some((s) => screenNeedsLogin(config, s))) {
    (login.actions ?? []).forEach((a) => resolveAction(a));
    Object.values(login.headers ?? {}).forEach((v) => substituteEnv(v));
  }
  const browser = await chromium.launch();
  const written: string[] = [];
  try {
    for (const deviceName of config.devices) {
      const device = findDevice(deviceName);
      for (const locale of config.locales) {
        for (let i = 0; i < config.screens.length; i++) {
          const screen: Screen = config.screens[i];
          const themes = themesFor(config, screen);
          const needsLogin = screenNeedsLogin(config, screen);
          for (const theme of themes) {
            const ctx = await browser.newContext({
              viewport: viewportFor(device),
              deviceScaleFactor: device.scale,
              isMobile: device.isMobile,
              hasTouch: device.isMobile,
              locale,
              colorScheme: theme,
              ...(needsLogin && login?.storageState ? { storageState: login.storageState } : {}),
              ...(needsLogin && login?.headers
                ? { extraHTTPHeaders: Object.fromEntries(Object.entries(login.headers).map(([k, v]) => [k, substituteEnv(v)])) }
                : {}),
            });
            try {
              const page = await ctx.newPage();
              if (needsLogin) await performLogin(page, config, baseUrl);
              await openReady(page, config, buildScreenUrl(baseUrl, screen.path));
              await waitForSpec(page, screen.waitFor);
              for (const a of screen.actions ?? []) await runAction(page, a);
              if (screen.actions?.length) await page.waitForTimeout(500);

              const file = outputPath(config.outDir, device.store, device.name, locale, i, screen.name, themes.length > 1 ? theme : undefined);
              mkdirSync(path.dirname(file), { recursive: true });
              await page.screenshot({ path: file });
              const size = readPngSize(readFileSync(file));
              if (size.width !== device.width || size.height !== device.height) {
                throw new Error(`${file} is ${size.width}x${size.height}, expected ${device.width}x${device.height}`);
              }
              log(`${file} (${size.width}x${size.height})`);
              written.push(file);
            } finally {
              await ctx.close();
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}
