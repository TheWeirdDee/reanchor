import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BarIndex, fromTuple, type BarTuple } from "../domain/candles";
import { weekendSessionFor, type BitgetClosure, type WeekendSession } from "../domain/calendar";
import { buildEpisode, type CorporateActionCheck, type Episode, type UnderlyingAnchor } from "../domain/episodes";
import type { InstrumentsFile, VerifiedInstrument } from "../domain/instruments";
import { addDays, etParts } from "../domain/time";
import { EVENT_CASH_DIVIDEND, EVENT_STOCK_DIVIDEND, EVENT_STOCK_SPLIT, type CorporateEventRow } from "./mcp";

export const DATA_DIR = join(process.cwd(), "data");

export interface CorporateFile {
  source: string;
  retrievedAt: string;
  byUnderlying: Record<string, { status: "OK" | "UNKNOWN"; events: CorporateEventRow[]; splitQueryOutcome: string; earnings: EarningsLike[]; error: string | null }>;
}
interface EarningsLike {
  perf_brief_dsclsr_date?: string | null;
  perf_briefing_fore_dsclsr_date?: string | null;
  perf_report_dsclsr_date?: string | null;
  perf_report_fore_dsclsr_date?: string | null;
  report_type_name?: string | null;
  is_trading_time?: string | null;
}
export interface FallbackCorporateFile {
  source: string;
  retrievedAt: string;
  byUnderlying: Record<string, { status: "OK" | "UNKNOWN"; splits: { type: string; status: string; adjustmentRatio: string; exDate: string }[]; dividends: { exDate: string; type: string; amount: string }[]; error: string | null }>;
}
export interface AnchorsFile {
  source: string;
  retrievedAt: string;
  daily: Record<string, { date: string; open: number; close: number }[]>;
}
export interface BarsFile {
  granularity: string;
  symbols: Record<string, BarTuple[]>;
}

export interface Dataset {
  instruments: InstrumentsFile;
  supported: VerifiedInstrument[];
  closures: BitgetClosure[];
  bars: Record<string, BarIndex>;
  anchors: AnchorsFile;
  corporate: CorporateFile;
  corporateFallback: FallbackCorporateFile | null;
  ingest: { finishedAt: string; coverage: Record<string, unknown> } & Record<string, unknown>;
  manifest: Record<string, unknown> | null;
}

const read = <T,>(f: string): T => JSON.parse(readFileSync(join(DATA_DIR, f), "utf8")) as T;

let cached: Dataset | null = null;
let cachedKey = "";

/**
 * Cache key from the data files' modification times. A re-ingest, validation or MCP refresh changes the key,
 * so server-rendered pages pick up new data without a rebuild.
 */
export function dataVersionKey(): string {
  return ["manifest.json", "bars.json", "corporate-actions.json", "corporate-fallback.json", "ingest-status.json", "instruments.json", "anchors.json"]
    .map((f) => {
      const p = join(DATA_DIR, f);
      return existsSync(p) ? `${f}:${statSync(p).mtimeMs}` : `${f}:-`;
    })
    .join("|");
}

export function datasetAvailable(): boolean {
  return ["instruments.json", "bars.json", "anchors.json", "corporate-actions.json", "ingest-status.json"].every((f) => existsSync(join(DATA_DIR, f)));
}

export function loadDataset(): Dataset {
  const key = dataVersionKey();
  if (cached && key === cachedKey) return cached;
  cachedKey = key;
  const instruments = read<InstrumentsFile>("instruments.json");
  const barsFile = read<BarsFile>("bars.json");
  const manifest = existsSync(join(DATA_DIR, "manifest.json")) ? read<Record<string, unknown>>("manifest.json") : null;
  const supportedSymbols = manifest && Array.isArray((manifest as { supportedSymbols?: string[] }).supportedSymbols)
    ? (manifest as { supportedSymbols: string[] }).supportedSymbols
    : instruments.instruments.filter((i) => i.supported).map((i) => i.symbol);
  const bars: Record<string, BarIndex> = {};
  for (const [sym, tuples] of Object.entries(barsFile.symbols)) bars[sym] = new BarIndex(tuples.map(fromTuple));
  cached = {
    instruments,
    supported: instruments.instruments.filter((i) => supportedSymbols.includes(i.symbol)),
    closures: instruments.marketCalendar.closures,
    bars,
    anchors: read<AnchorsFile>("anchors.json"),
    corporate: read<CorporateFile>("corporate-actions.json"),
    corporateFallback: existsSync(join(DATA_DIR, "corporate-fallback.json")) ? read<FallbackCorporateFile>("corporate-fallback.json") : null,
    ingest: read("ingest-status.json"),
    manifest,
  };
  return cached;
}

/** All weekend sessions whose window overlaps [fromMs, toMs]. */
export function sessionsBetween(fromMs: number, toMs: number, closures: BitgetClosure[] | null): WeekendSession[] {
  const out: WeekendSession[] = [];
  let sat = etParts(fromMs).date;
  while (new Date(sat + "T00:00:00Z").getUTCDay() !== 6) sat = addDays(sat, 1);
  sat = addDays(sat, -7);
  for (; ; sat = addDays(sat, 7)) {
    const s = weekendSessionFor(sat, closures);
    if (!s || s.startMs > toMs) break;
    if (s.endpointMs >= fromMs) out.push(s);
  }
  return out;
}

/**
 * Corporate-action check for one weekend: a split, reverse split or ex-dividend date falling after the last close
 * and on or before the reopening day affects the episode. Bitget AI MCP is the primary source. When it is unavailable,
 * Bitget split records plus Nasdaq dividend history are used and labeled. Hits from any available source count.
 */
export function corporateCheck(ds: Dataset, underlying: string, s: WeekendSession): CorporateActionCheck {
  const inWindow = (d: string | null | undefined) => !!d && d > s.lastTradingDay && d <= s.nextTradingDay;
  const hits: string[] = [];
  const sources: string[] = [];
  const c = ds.corporate.byUnderlying[underlying];
  if (c && c.status === "OK") {
    sources.push("Bitget AI MCP");
    for (const e of c.events) {
      if (e.event_type === EVENT_STOCK_SPLIT && inWindow(e.split_valid_date ?? e.ex_dividend_date)) {
        hits.push(`split ${e.split_numerator}:${e.split_denominator} effective ${e.split_valid_date ?? e.ex_dividend_date}`);
      } else if ((e.event_type === EVENT_CASH_DIVIDEND || e.event_type === EVENT_STOCK_DIVIDEND) && inWindow(e.ex_dividend_date)) {
        hits.push(`ex-dividend ${e.ex_dividend_date} (${e.amount ?? "?"} ${e.currency ?? ""}) on the reopening day`);
      }
    }
  }
  const f = ds.corporateFallback?.byUnderlying[underlying];
  if (f && f.status === "OK") {
    sources.push("Bitget split records + Nasdaq dividend history");
    for (const sp of f.splits) if (inWindow(sp.exDate)) hits.push(`${sp.type} ratio ${sp.adjustmentRatio} effective ${sp.exDate} (Bitget)`);
    for (const dv of f.dividends) if (inWindow(dv.exDate)) hits.push(`ex-dividend ${dv.exDate} (${dv.amount}) on the reopening day (Nasdaq)`);
  }
  if (!sources.length) return { status: "UNKNOWN", detail: c?.error ?? "No corporate-action source available" };
  const via = sources.join("; ");
  const mcpNote = c?.status === "OK" ? "" : " Bitget AI MCP unavailable; fallback sources used.";
  return hits.length
    ? { status: "AFFECTED", detail: `${[...new Set(hits)].join("; ")} [${via}]` }
    : { status: "CLEAR", detail: `No split or ex-dividend date between the last close and the reopening [${via}].${mcpNote}` };
}

export function anchorFor(ds: Dataset, underlying: string, s: WeekendSession): UnderlyingAnchor {
  const daily = ds.anchors.daily[underlying] ?? [];
  const fri = daily.find((d) => d.date === s.lastTradingDay);
  const reo = daily.find((d) => d.date === s.nextTradingDay);
  return {
    fridayClose: fri?.close ?? null,
    fridayCloseDate: fri ? fri.date : null,
    reopenOpen: reo?.open ?? null,
    reopenOpenDate: reo ? reo.date : null,
    source: "Nasdaq.com historical quotes (official daily open/close)",
    status: fri ? "VERIFIED" : "UNKNOWN",
    note: fri ? "Official regular-session close in USD; kept separate from token prices" : "No official close found for the last trading day",
  };
}

export function earningsNote(ds: Dataset, underlying: string, s: WeekendSession): string | null {
  const c = ds.corporate.byUnderlying[underlying];
  if (!c || c.status !== "OK") return null;
  const dates = new Set<string>();
  for (const e of c.earnings) {
    for (const d of [e.perf_brief_dsclsr_date, e.perf_briefing_fore_dsclsr_date, e.perf_report_dsclsr_date, e.perf_report_fore_dsclsr_date]) {
      if (d) dates.add(d.slice(0, 10));
    }
  }
  const near = [...dates].filter((d) => d >= s.lastTradingDay && d <= s.nextTradingDay).sort();
  if (near.length) return `Earnings disclosure dated ${near.join(", ")} falls between the last close and the reopening (Bitget AI MCP earnings calendar)`;
  const upcoming = [...dates].filter((d) => d > s.nextTradingDay).sort()[0];
  return upcoming ? `No earnings disclosure between the last close and the reopening; next listed disclosure date ${upcoming} (Bitget AI MCP earnings calendar)` : "No earnings disclosure listed between the last close and the reopening (Bitget AI MCP earnings calendar)";
}

export function episodesFor(ds: Dataset, inst: VerifiedInstrument, sessions: WeekendSession[]): Episode[] {
  const idx = ds.bars[inst.symbol];
  if (!idx) return [];
  return sessions.map((s) => buildEpisode(inst.symbol, s, idx, corporateCheck(ds, inst.underlying, s), anchorFor(ds, inst.underlying, s)));
}
