import { createHash } from "node:crypto";

/** Elements that are likely to be clickable. Flutter web exposes them as flt-semantics nodes once semantics are on. */
export const CLICKABLE_SELECTOR =
  "flt-semantics[role=button], flt-semantics[role=link], flt-semantics[role=tab], flt-semantics[flt-tappable], [role=button], [role=link], [role=tab], a[href], button";

export interface Candidate {
  index: number;
  label: string;
}

export interface Skipped {
  label: string;
  reason: string;
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}

export function screenKey(url: string, imageHash: string): string {
  return `${url}|${imageHash}`;
}

/** Record the screen and return true if it was not seen before. */
export function registerScreen(seen: Set<string>, url: string, imageHash: string): boolean {
  const key = screenKey(url, imageHash);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** File-name-safe slug for a screen name, e.g. "Get started!" -> "get-started". */
export function slugify(label: string, fallback: string): string {
  const s = label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");
  return s || fallback;
}

/** Unique screen name for a discovered screen: label slug, suffixed with a counter if already used. */
export function uniqueName(label: string, fallback: string, used: Set<string>): string {
  const base = slugify(label, fallback);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  used.add(name);
  return name;
}

export function formatSkipped(skipped: Skipped[]): string[] {
  return skipped.map((s) => `  - ${s.label || "(no label)"}: ${s.reason}`);
}

/** First line of an error message, so Playwright call logs do not flood the output. */
export function shortError(e: unknown): string {
  return String((e as Error)?.message ?? e).split("\n")[0];
}
