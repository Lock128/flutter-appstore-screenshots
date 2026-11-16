import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import type { Action, Config, Screen } from "./config.js";
import { findDevice, viewportFor } from "./sizes.js";

export function readPngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function outputPath(outDir: string, store: string, device: string, locale: string, index: number, name: string): string {
  return path.join(outDir, store, device, locale, `${String(index + 1).padStart(2, "0")}-${name}.png`);
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

export async function capture(config: Config, baseUrl: string, log: (m: string) => void = console.log): Promise<string[]> {
  const browser = await chromium.launch();
  const written: string[] = [];
  try {
    for (const deviceName of config.devices) {
      const device = findDevice(deviceName);
      for (const locale of config.locales) {
        for (let i = 0; i < config.screens.length; i++) {
          const screen: Screen = config.screens[i];
          const ctx = await browser.newContext({
            viewport: viewportFor(device),
            deviceScaleFactor: device.scale,
            isMobile: device.isMobile,
            hasTouch: device.isMobile,
            locale,
            colorScheme: screen.theme ?? "light",
          });
          const page = await ctx.newPage();
          await page.goto(buildScreenUrl(baseUrl, screen.path), { waitUntil: "load" });
          await page.waitForSelector(config.readySelector, { timeout: 60_000 });
          if (config.enableSemantics) {
            await page.locator("flt-semantics-placeholder").evaluate((el) => (el as HTMLElement).click()).catch(() => {});
          }
          await page.waitForTimeout(config.settleMs);
          if (typeof screen.waitFor === "string") await page.waitForSelector(screen.waitFor, { timeout: 30_000 });
          else if (typeof screen.waitFor === "number") await page.waitForTimeout(screen.waitFor);
          for (const a of screen.actions ?? []) await runAction(page, a);
          if (screen.actions?.length) await page.waitForTimeout(500);

          const file = outputPath(config.outDir, device.store, device.name, locale, i, screen.name);
          mkdirSync(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file });
          const size = readPngSize(readFileSync(file));
          if (size.width !== device.width || size.height !== device.height) {
            throw new Error(`${file} is ${size.width}x${size.height}, expected ${device.width}x${device.height}`);
          }
          log(`${file} (${size.width}x${size.height})`);
          written.push(file);
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}
