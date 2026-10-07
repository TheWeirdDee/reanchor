import { z } from "zod";
import { BAR_MS } from "./time";

/**
 * A normalized 15-minute bar. `ts` is the interval START in UTC milliseconds
 * (Bitget v3 candle semantics, confirmed against session boundaries in docs/DATA_GATE.md).
 * Turnover is quote-coin (USDT) turnover; null means the source supplied no usable value,
 * which is different from zero.
 */
export interface Bar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVolume: number | null;
  quoteTurnover: number | null;
}

/** Compact tuple used in data/bars.json. */
export type BarTuple = [number, number, number, number, number, number | null, number | null];

export const toTuple = (b: Bar): BarTuple => [b.ts, b.open, b.high, b.low, b.close, b.baseVolume, b.quoteTurnover];
export const fromTuple = (t: BarTuple): Bar => ({
  ts: t[0],
  open: t[1],
  high: t[2],
  low: t[3],
  close: t[4],
  baseVolume: t[5],
  quoteTurnover: t[6],
});

const numericString = z.string().regex(/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/);

/** Raw Bitget v3 candle row: [ts, open, high, low, close, baseVolume, quoteTurnover]. */
export const RawCandleRow = z
  .tuple([numericString, numericString, numericString, numericString, numericString])
  .rest(z.union([numericString, z.literal(""), z.null()]));

export const RawCandleResponse = z.object({
  code: z.string(),
  msg: z.string(),
  requestTime: z.number(),
  data: z.array(RawCandleRow).nullable(),
});

export type ExclusionCode =
  | "INVALID_OHLC"
  | "UNCLOSED"
  | "OFF_GRID"
  | "CONFLICTING_DUPLICATE"
  | "NON_FINITE";

export interface NormalizeIssue {
  ts: number;
  code: ExclusionCode;
  detail: string;
}

export interface NormalizeResult {
  bars: Bar[];
  issues: NormalizeIssue[];
  duplicatesIdentical: number;
}

function parseOptional(v: string | null | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


/**
 * Normalize raw rows. Excludes unclosed bars (ts + 15m > asOfMs), off-grid timestamps,
 * invalid OHLC and conflicting duplicates (both copies removed and reported).
 */
export function normalizeCandles(rows: z.infer<typeof RawCandleRow>[], asOfMs: number): NormalizeResult {
  const issues: NormalizeIssue[] = [];
  const byTs = new Map<number, Bar>();
  const conflicted = new Set<number>();
  let duplicatesIdentical = 0;

  for (const row of rows) {
    const ts = Number(row[0]);
    const [open, high, low, close] = [row[1], row[2], row[3], row[4]].map(Number);
    const baseVolume = parseOptional(row[5] as string | null | undefined);
    const quoteTurnover = parseOptional(row[6] as string | null | undefined);
    if (![ts, open, high, low, close].every(Number.isFinite)) {
      issues.push({ ts, code: "NON_FINITE", detail: "non-finite field" });
      continue;
    }
    if (ts % BAR_MS !== 0) {
      issues.push({ ts, code: "OFF_GRID", detail: "timestamp not on 15m grid" });
      continue;
    }
    if (ts + BAR_MS > asOfMs) {
      issues.push({ ts, code: "UNCLOSED", detail: "bar not closed at retrieval time" });
      continue;
    }
    if (
      open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high) ||
      (baseVolume !== null && baseVolume < 0) || (quoteTurnover !== null && quoteTurnover < 0)
    ) {
      issues.push({ ts, code: "INVALID_OHLC", detail: `o=${open} h=${high} l=${low} c=${close}` });
      continue;
    }
    const bar: Bar = { ts, open, high, low, close, baseVolume, quoteTurnover };
    const prev = byTs.get(ts);
    if (prev) {
      const same =
        prev.open === bar.open && prev.high === bar.high && prev.low === bar.low &&
        prev.close === bar.close && prev.baseVolume === bar.baseVolume && prev.quoteTurnover === bar.quoteTurnover;
      if (same) duplicatesIdentical++;
      else conflicted.add(ts);
      continue;
    }
    byTs.set(ts, bar);
  }
  for (const ts of conflicted) {
    byTs.delete(ts);
    issues.push({ ts, code: "CONFLICTING_DUPLICATE", detail: "same timestamp with different values; both removed" });
  }
  const bars = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  return { bars, issues, duplicatesIdentical };
}

/** Index bars by interval start for O(1) boundary lookup. */
export class BarIndex {
  private readonly map = new Map<number, Bar>();
  readonly first: number | null;
  readonly last: number | null;

  constructor(readonly bars: Bar[]) {
    for (const b of bars) this.map.set(b.ts, b);
    this.first = bars.length ? bars[0].ts : null;
    this.last = bars.length ? bars[bars.length - 1].ts : null;
  }

  /** Bar whose interval STARTS at ms. */
  starting(ms: number): Bar | undefined {
    return this.map.get(ms);
  }

  /** Bar whose interval ENDS exactly at ms. */
  endingAt(ms: number): Bar | undefined {
    return this.map.get(ms - BAR_MS);
  }

  /** Bars with start in [fromMs, toMs). */
  range(fromMs: number, toMs: number): Bar[] {
    const out: Bar[] = [];
    for (let t = fromMs; t < toMs; t += BAR_MS) {
      const b = this.map.get(t);
      if (b) out.push(b);
    }
    return out;
  }

  /** Latest bar that ends at or before ms. */
  latestEndingBy(ms: number, lookbackMs = 7 * 24 * 3_600_000): Bar | undefined {
    for (let t = Math.floor(ms / BAR_MS) * BAR_MS - BAR_MS; t >= ms - lookbackMs; t -= BAR_MS) {
      const b = this.map.get(t);
      if (b) return b;
    }
    return undefined;
  }

  /** Count missing 15m intervals in [fromMs, toMs). */
  missingIn(fromMs: number, toMs: number): number {
    let n = 0;
    for (let t = fromMs; t < toMs; t += BAR_MS) if (!this.map.has(t)) n++;
    return n;
  }
}
