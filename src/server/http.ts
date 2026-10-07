import { installDnsFallback } from "./net";

installDnsFallback();

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  init?: RequestInit;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with a hard timeout and a bounded number of retries (exponential backoff).
 * Retries only on network errors, 429 and 5xx. Never retries indefinitely.
 */
export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<{ body: unknown; status: number; retrievedAtMs: number }> {
  const { timeoutMs = 10_000, retries = 2, headers = {}, init = {} } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...headers }, signal: ctrl.signal, cache: "no-store" });
      const retrievedAtMs = Date.now();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(`HTTP ${res.status}`, res.status, url);
      } else if (!res.ok) {
        throw new HttpError(`HTTP ${res.status}`, res.status, url);
      } else {
        return { body: await res.json(), status: res.status, retrievedAtMs };
      }
    } catch (e) {
      if (e instanceof HttpError && e.status !== null && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(400 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Small in-memory TTL cache for server-side provider calls. */
export class TtlCache<T> {
  private readonly store = new Map<string, { at: number; value: T }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string, now = Date.now()): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (now - hit.at > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T, now = Date.now()): void {
    this.store.set(key, { at: now, value });
  }
}
