/**
 * SYNTHETIC TEST FIXTURES. Isolated to automated tests; never imported by the application,
 * the ingest scripts or any evidence file. Prices and turnover here are invented for unit tests only.
 */
import { BarIndex, type Bar } from "../../src/domain/candles";
import { weekendSessionFor, type WeekendSession } from "../../src/domain/calendar";
import { buildEpisode, type Episode } from "../../src/domain/episodes";
import type { VerifiedInstrument } from "../../src/domain/instruments";
import { addDays, BAR_MS, HOUR } from "../../src/domain/time";

export const SYNTH_SYMBOL = "SYNTHUSDT";

export const synthInstrument: VerifiedInstrument = {
  symbol: SYNTH_SYMBOL,
  baseCoin: "rSYNTH",
  quoteCoin: "USDT",
  underlying: "SYNTH",
  underlyingAssetClass: "stocks",
  pricePrecision: 2,
  quantityPrecision: 4,
  minOrderQty: 0.0001,
  minOrderAmount: 10,
  buyLimitPriceRatio: 0.1,
  sellLimitPriceRatio: 0.1,
  launchTimeMs: null,
  weekendTradable: true,
  tradingPeriod: [],
  identityEvidence: ["synthetic"],
  supported: true,
  exclusionReason: null,
};

export interface WeekendSpec {
  /** Weekend move at the Sunday 20:00 ET decision. */
  w: number;
  /** Total reopening return from the decision to the first-hour end. */
  r: number;
  /** Reopening gap from the decision. */
  g?: number;
  /** USDT turnover per 15m weekend bar (hours are complete). */
  turnoverPerBar?: number;
  /** Omit these bars (by role) to test missing boundaries. */
  omit?: ("friday" | "decision" | "reopen" | "endpoint")[];
}

/** Bar with open=close=price unless given. */
function bar(ts: number, open: number, close: number, turnover: number | null): Bar {
  return { ts, open, high: Math.max(open, close), low: Math.min(open, close), close, baseVolume: turnover === null ? null : turnover / close, quoteTurnover: turnover };
}

/** Saturdays starting at `firstSaturday`, one per spec. */
export function buildFixture(firstSaturday: string, specs: WeekendSpec[], base = 100) {
  const bars: Bar[] = [];
  const sessions: WeekendSession[] = [];
  let sat = firstSaturday;
  for (const spec of specs) {
    const s = weekendSessionFor(sat, [])!;
    sessions.push(s);
    const friday = base;
    const decision = friday * (1 + spec.w);
    const reopen = decision * (1 + (spec.g ?? spec.r / 2));
    const endpoint = decision * (1 + spec.r);
    const omit = new Set(spec.omit ?? []);
    if (!omit.has("friday")) bars.push(bar(s.startMs - BAR_MS, friday, friday, 1000));
    // Weekend book: complete 15m bars at a flat price path from friday to decision.
    const tpb = spec.turnoverPerBar ?? 250;
    for (let t = s.startMs; t < s.transitionMs - BAR_MS; t += BAR_MS) bars.push(bar(t, friday, friday, tpb));
    if (!omit.has("decision")) bars.push(bar(s.transitionMs - BAR_MS, friday, decision, tpb));
    if (!omit.has("reopen")) bars.push(bar(s.reopenMs, reopen, reopen, 5_000_000));
    for (let t = s.reopenMs + BAR_MS; t < s.endpointMs - BAR_MS; t += BAR_MS) bars.push(bar(t, reopen, reopen, 5_000_000));
    if (!omit.has("endpoint")) bars.push(bar(s.endpointMs - BAR_MS, reopen, endpoint, 5_000_000));
    sat = addDays(sat, 7);
  }
  bars.sort((a, b) => a.ts - b.ts);
  const index = new BarIndex(bars);
  const episodes: Episode[] = sessions.map((s) => buildEpisode(SYNTH_SYMBOL, s, index, { status: "CLEAR", detail: "synthetic" }, null));
  return { bars, index, sessions, episodes };
}

export const HOUR_MS = HOUR;
