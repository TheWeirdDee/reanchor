import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = join(__dirname, "..", "..");
export const DATA = join(ROOT, "data");
export const RAW = join(DATA, "raw");

/** Write JSON atomically: write a temp file, then rename over the target. */
export function writeJsonAtomic(path: string, value: unknown, pretty = true): string {
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(value, null, pretty ? 2 : undefined) + "\n";
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
  return createHash("sha256").update(text).digest("hex");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readJsonIfExists<T>(path: string): T | null {
  return existsSync(path) ? readJson<T>(path) : null;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simple pacer to stay below a requests-per-second budget. */
export function pacer(perSecond: number) {
  const gap = 1000 / perSecond;
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    if (wait) await sleep(wait);
  };
}

export function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}
