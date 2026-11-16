import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Resolve a request path to a file inside root, or null. Blocks path traversal. */
export function resolveFile(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const full = path.resolve(root, "." + path.posix.normalize("/" + decoded));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  return null;
}

export async function serveDir(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, "index.html"))) {
    throw new Error(`No index.html in ${root}. Run "flutter build web" first or use --build.`);
  }
  const server = http.createServer((req, res) => {
    const file = resolveFile(root, req.url ?? "/") ?? path.join(root, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
