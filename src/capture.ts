import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { screenNeedsLogin, themesFor, type Action, type Config, type Screen } from "./config.js";
import { findDevice, viewportFor, type DevicePreset } from "./sizes.js";
import { CLICKABLE_SELECTOR, formatSkipped, hashBuffer, registerScreen, shortError, uniqueName, type Skipped } from "./discover.js";

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

export function describeAction(a: Action): string {
  if ("click" in a) return `click "${a.click}"`;
  if ("clickAt" in a) return `clickAt [${a.clickAt.join(", ")}]`;
  if ("type" in a) return `type into "${a.type}"`; // never include the typed text
  if ("scroll" in a) return `scroll ${a.scroll}`;
  return `wait ${a.wait}ms`;
}

/**
 * Resolve a click target. Flutter semantics expose labels as aria-label (older
 * engines) or as text nodes (newer ones), so plain text is matched against
 * accessible names, labels and text content. Explicit selectors (text=, css=,
 * or something starting with . # [ or containing >) are passed to Playwright as is.
 */
export function isExplicitSelector(s: string): boolean {
  return /^(text|css|xpath|role|id)=/.test(s) || /^[.#\[]/.test(s) || s.includes(" > ");
}

async function clickByLabel(page: Page, label: string, timeout: number): Promise<void> {
  const candidates = [
    page.getByRole("tab", { name: label }),
    page.getByRole("button", { name: label }),
    page.getByRole("link", { name: label }),
    page.getByLabel(label),
    page.getByText(label),
    page.locator(`flt-semantics[aria-label*="${label.replace(/"/g, '\\"')}"]`),
  ];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      if ((await c.count().catch(() => 0)) > 0) {
        await c.first().click({ timeout });
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  const names = await page
    .locator("flt-semantics[aria-label], flt-semantics[role]")
    .evaluateAll((els) => els.slice(0, 40).map((e) => e.getAttribute("aria-label") || e.textContent || "").filter(Boolean))
    .catch(() => [] as string[]);
  throw new Error(`Could not find "${label}" to click (is enableSemantics on?). Semantics labels found: ${JSON.stringify(names)}`);
}

async function runAction(page: Page, a: Action, timeout: number): Promise<void> {
  if ("click" in a) {
    if (isExplicitSelector(a.click)) await page.locator(a.click).first().click({ timeout });
    else await clickByLabel(page, a.click, timeout);
  } else if ("clickAt" in a) {
    await page.mouse.click(a.clickAt[0], a.clickAt[1]);
  } else if ("type" in a) {
    await page.locator(a.type).first().fill(a.text, { timeout });
  } else if ("scroll" in a) {
    await page.mouse.move(100, 300);
    await page.mouse.wheel(0, a.scroll);
  } else {
    await page.waitForTimeout(a.wait);
  }
}

/**
 * Open a URL. Waits for domcontentloaded (Flutter's heavy assets can keep "load" pending for a long time)
 * and then for the Flutter view element. Retries, since the first attempt on a cold server often times out.
 */
async function openReady(page: Page, config: Config, url: string, warn: (m: string) => void = () => {}): Promise<void> {
  const attempts = config.retries + 1;
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
      await page.waitForSelector(config.readySelector, { timeout: config.navigationTimeoutMs });
      break;
    } catch (e) {
      if (attempt >= attempts) throw e;
      warn(`Warning: opening ${url} failed (attempt ${attempt}/${attempts}): ${shortError(e)}. Retrying.`);
    }
  }
  if (config.enableSemantics) {
    await page.locator("flt-semantics-placeholder").evaluate((el) => (el as HTMLElement).click(), undefined, { timeout: 3000 }).catch(() => {});
    await page.waitForSelector("flt-semantics", { state: "attached", timeout: 10_000 }).catch(() => warn("Warning: Flutter semantics tree did not appear; click by label will fail"));
  }
  await page.waitForTimeout(config.settleMs);
}

async function waitForSpec(page: Page, spec: number | string | undefined, timeout: number): Promise<void> {
  if (typeof spec === "string") await page.waitForSelector(spec, { timeout });
  else if (typeof spec === "number") await page.waitForTimeout(spec);
}

async function performLogin(page: Page, config: Config, baseUrl: string): Promise<void> {
  const login = config.login!;
  const actions = (login.actions ?? []).map((a) => resolveAction(a));
  if (actions.length === 0) return;
  await openReady(page, config, buildScreenUrl(baseUrl, login.path));
  for (let i = 0; i < actions.length; i++) {
    try {
      await runAction(page, actions[i], config.actionTimeoutMs);
    } catch {
      // Do not include the underlying error: it can echo typed values.
      throw new Error(`Login failed at login.actions[${i}]. Check the selector and that the login page is reachable.`);
    }
  }
  try {
    await waitForSpec(page, login.waitFor, config.navigationTimeoutMs);
  } catch {
    throw new Error("Login did not complete: login.waitFor was not satisfied. Check the credentials.");
  }
  await page.waitForTimeout(500);
}

/** Add the login headers only to requests that go to the app's own origin. */
export function headersForRequest(requestUrl: string, baseUrl: string, headers: Record<string, string>, existing: Record<string, string> = {}): Record<string, string> | undefined {
  try {
    if (new URL(requestUrl).origin !== new URL(baseUrl).origin) return undefined;
  } catch {
    return undefined;
  }
  return { ...existing, ...headers };
}

async function saveShot(page: Page, file: string, device: DevicePreset): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  const size = readPngSize(readFileSync(file));
  if (size.width !== device.width || size.height !== device.height) {
    throw new Error(`${file} is ${size.width}x${size.height}, expected ${device.width}x${device.height}`);
  }
}

/** Visible label of an element: aria-label, text, title or value. */
async function labelOf(loc: Locator): Promise<string> {
  const text = await loc
    .evaluate((el) => (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.getAttribute("value") || "").trim(), undefined, { timeout: 2000 })
    .catch(() => "");
  return text.replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Discovery mode: click each clickable element of the start screen, one at a time
 * (reopening the start route between attempts), and screenshot every screen that looks new.
 */
export async function discoverScreens(
  ctx: BrowserContext,
  config: Config,
  baseUrl: string,
  device: DevicePreset,
  locale: string,
  themeSuffix: string | undefined,
  log: (m: string) => void,
): Promise<string[]> {
  const written: string[] = [];
  const skipped: Skipped[] = [];
  const startUrl = buildScreenUrl(baseUrl, config.screens[0]?.path);
  const budget = config.maxScreens - config.screens.length;
  const page = await ctx.newPage();
  try {
    await openReady(page, config, startUrl, log);
    const seen = new Set<string>();
    registerScreen(seen, page.url(), hashBuffer(await page.screenshot()));
    const total = await page.locator(CLICKABLE_SELECTOR).count();
    log(`Discovery: found ${total} clickable element(s) on ${startUrl}, capturing up to ${Math.max(budget, 0)} more screen(s)`);
    const usedNames = new Set(config.screens.map((s) => s.name));
    let index = config.screens.length;
    let found = 0;
    for (let n = 0; n < total; n++) {
      if (found >= budget) {
        log(`Discovery: reached --max-screens (${config.maxScreens}), stopping`);
        break;
      }
      let label = `element ${n + 1}`;
      try {
        if (n > 0) await openReady(page, config, startUrl, log);
        const el = page.locator(CLICKABLE_SELECTOR).nth(n);
        const text = await labelOf(el);
        if (text) label = text;
        if (!(await el.isVisible())) throw new Error("not visible on the start screen");
        try {
          await el.click({ timeout: config.actionTimeoutMs });
        } catch (e) {
          // Covered or off-screen: fall back to a click at its center.
          const box = await el.boundingBox({ timeout: 2000 }).catch(() => null);
          if (!box || box.width === 0 || box.height === 0) throw e;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        await page.waitForTimeout(Math.max(config.settleMs, 500));
        const shot = await page.screenshot();
        if (!registerScreen(seen, page.url(), hashBuffer(shot))) {
          skipped.push({ label, reason: "clicked, but no new screen appeared" });
          continue;
        }
        const name = uniqueName(label, `screen-${index + 1}`, usedNames);
        const file = outputPath(config.outDir, device.store, device.name, locale, index, name, themeSuffix);
        await saveShot(page, file, device);
        log(`${file} (${device.width}x${device.height}) <- "${label}"`);
        written.push(file);
        index++;
        found++;
      } catch (e) {
        skipped.push({ label, reason: shortError(e) });
        log(`Warning: discovery: could not click "${label}": ${shortError(e)}`);
      }
    }
    if (skipped.length) {
      log(`Discovery: ${skipped.length} element(s) did not lead to a new screen:`);
      for (const line of formatSkipped(skipped)) log(line);
    }
  } finally {
    await page.close().catch(() => {});
  }
  return written;
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
        const newContext = async (theme: "light" | "dark", signedIn: boolean): Promise<BrowserContext> => {
          const ctx = await browser.newContext({
            viewport: viewportFor(device),
            deviceScaleFactor: device.scale,
            isMobile: device.isMobile,
            hasTouch: device.isMobile,
            locale,
            colorScheme: theme,
            ...(signedIn && login?.storageState ? { storageState: login.storageState } : {}),
          });
          if (signedIn && login?.headers) {
            const headers = Object.fromEntries(Object.entries(login.headers).map(([k, v]) => [k, substituteEnv(v)]));
            // Scoped to the app origin so tokens never reach CDNs or other third parties.
            await ctx.route("**/*", (route) => {
              const h = headersForRequest(route.request().url(), baseUrl, headers, route.request().headers());
              return h ? route.continue({ headers: h }) : route.continue();
            });
          }
          return ctx;
        };
        // One signed-in context per theme, signed in once and reused by all login screens.
        const loggedIn = new Map<string, BrowserContext>();
        try {
          for (let i = 0; i < config.screens.length; i++) {
            const screen: Screen = config.screens[i];
            const themes = themesFor(config, screen);
            const needsLogin = screenNeedsLogin(config, screen);
            for (const theme of themes) {
              let ctx: BrowserContext;
              if (needsLogin) {
                let shared = loggedIn.get(theme);
                if (!shared) {
                  shared = await newContext(theme, true);
                  loggedIn.set(theme, shared);
                  const loginPage = await shared.newPage();
                  await performLogin(loginPage, config, baseUrl);
                  await loginPage.close();
                }
                ctx = shared;
              } else {
                ctx = await newContext(theme, false);
              }
              try {
                const page = await ctx.newPage();
                try {
                  await openReady(page, config, buildScreenUrl(baseUrl, screen.path), log);
                  try {
                    await waitForSpec(page, screen.waitFor, config.actionTimeoutMs);
                  } catch (e) {
                    log(`Warning: screen "${screen.name}": waitFor ${String(screen.waitFor)} not satisfied: ${shortError(e)}. Capturing anyway.`);
                  }
                  const acts = screen.actions ?? [];
                  for (let k = 0; k < acts.length; k++) {
                    try {
                      await runAction(page, acts[k], config.actionTimeoutMs);
                    } catch (e) {
                      log(`Warning: screen "${screen.name}": step ${k + 1} (${describeAction(acts[k])}) failed: ${shortError(e).replace(/\.$/, "")}. Continuing.`);
                    }
                  }
                  if (acts.length) await page.waitForTimeout(500);
                  const file = outputPath(config.outDir, device.store, device.name, locale, i, screen.name, themes.length > 1 ? theme : undefined);
                  await saveShot(page, file, device);
                  log(`${file} (${device.width}x${device.height})`);
                  written.push(file);
                } catch (e) {
                  log(`Warning: screen "${screen.name}" skipped: ${shortError(e)}`);
                } finally {
                  await page.close().catch(() => {});
                }
              } finally {
                if (!needsLogin) await ctx.close();
              }
            }
          }
          if (config.discover) {
            for (const theme of themesFor(config, {})) {
              const ctx = await newContext(theme, !!login && config.screens.some((s) => screenNeedsLogin(config, s)));
              try {
                const suffix = themesFor(config, {}).length > 1 ? theme : undefined;
                written.push(...(await discoverScreens(ctx, config, baseUrl, device, locale, suffix, log)));
              } catch (e) {
                log(`Warning: discovery skipped on ${device.name} ${locale} ${theme}: ${shortError(e)}`);
              } finally {
                await ctx.close();
              }
            }
          }
        } finally {
          for (const c of loggedIn.values()) await c.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}
