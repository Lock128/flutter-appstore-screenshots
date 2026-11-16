#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { capture } from "./capture.js";
import { loadConfig } from "./config.js";
import { serveDir } from "./server.js";
import { DEVICES, viewportFor } from "./sizes.js";

const program = new Command();
program.name("flutter-screenshots").description("Create Play Store and App Store screenshots from a Flutter web build");

program
  .command("list-devices")
  .description("List device presets and their store pixel sizes")
  .action(() => {
    for (const d of DEVICES) {
      const v = viewportFor(d);
      console.log(`${d.name.padEnd(22)} ${d.store.padEnd(7)} ${`${d.width}x${d.height}`.padEnd(10)} viewport ${v.width}x${v.height} @${d.scale}x  ${d.description}`);
    }
  });

program
  .command("init")
  .description("Write an example screenshots.config.json")
  .option("--out <file>", "target file", "screenshots.config.json")
  .action((o: { out: string }) => {
    if (existsSync(o.out)) throw new Error(`${o.out} already exists`);
    const here = path.dirname(fileURLToPath(import.meta.url));
    copyFileSync(path.join(here, "..", "screenshots.config.example.json"), o.out);
    console.log(`Wrote ${o.out}. Edit it, then run: flutter-screenshots capture`);
  });

program
  .command("capture")
  .description("Capture screenshots for all configured devices and screens")
  .option("--config <file>", "config file", "screenshots.config.json")
  .option("--url <url>", "URL of a running Flutter web app")
  .option("--web-dir <dir>", "directory containing a built Flutter web app (build/web)")
  .option("--device <names...>", "limit to these device presets")
  .option("--out <dir>", "output directory")
  .option("--build", "run flutter build web --release in flutterProject first")
  .action(async (o: { config: string; url?: string; webDir?: string; device?: string[]; out?: string; build?: boolean }) => {
    const config = loadConfig(o.config);
    if (o.url) config.url = o.url;
    if (o.webDir) config.webDir = o.webDir;
    if (o.device) config.devices = o.device;
    if (o.out) config.outDir = o.out;

    let webDir = config.webDir;
    if (o.build) {
      const project = config.flutterProject ?? ".";
      console.log(`Running flutter build web in ${project} (CanvasKit renderer is the default)`);
      const r = spawnSync("flutter", ["build", "web", "--release", "--pwa-strategy", "none"], { cwd: project, stdio: "inherit" });
      if (r.status !== 0) throw new Error("flutter build web failed");
      webDir = path.join(project, "build", "web");
    } else if (!config.url && !webDir && config.flutterProject) {
      webDir = path.join(config.flutterProject, "build", "web");
    }

    if (config.url && !o.webDir && !o.build) {
      await capture(config, config.url);
      return;
    }
    if (!webDir) throw new Error("Provide a url, webDir or flutterProject");
    const server = await serveDir(webDir);
    try {
      await capture(config, server.url);
    } finally {
      await server.close();
    }
  });

program.parseAsync().catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
