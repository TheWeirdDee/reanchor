import "server-only";
import { normalizeCandles, BarIndex, type Bar } from "../domain/candles";
import { sessionStateAt } from "../domain/calendar";
import { etOffsetHours, BAR_MS } from "../domain/time";
import { median } from "../domain/stats";
import { calendarClosures, getCandles, getMarketCalendar, getMarketStates } from "./bitget";
import { getDailyHistory } from "./nasdaq";
import { BitgetMcp, CorporateEventRow, type ToolReceipt } from "./mcp";
import { TtlCache } from "./http";
import { getBitgetSplitRecords, getNasdaqDividends } from "./corporate-fallback";
import { BitgetAgentMcp } from "./agent-mcp";
import { RawCandleRow } from "../domain/candles";
import { sessionsBetween, type Dataset } from "./dataset";
import type { LiveInputs } from "./research";
import type { VerifiedInstrument } from "../domain/instruments";

/** Server-side live provider calls with timeouts, bounded retries and short caches. */
const calendarCache = new TtlCache<{ closures: { startEt: string; endEt: string }[]; states: Awaited<ReturnType<typeof getMarketStates>>["data"]; retrievedAt: string }>(10 * 60_000);
const candleCache = new TtlCache<{ bars: Bar[]; retrievedAt: string; source: "AGENT_MCP" | "DIRECT_V3"; agentError: string | null; sha256: string | null }>(60_000);
const anchorCache = new TtlCache<{ close: number; date: string } | null>(15 * 60_000);
const corpCache = new TtlCache<{ status: "OK" | "UNKNOWN"; events: CorporateEventRow[]; receipt: ToolReceipt | null }>(60 * 60_000);

const fallbackCorpCache = new TtlCache<{ exDates: { date: string; what: string }[]; retrievedAt: string } | null>(60 * 60_000);

/** Labeled fallback when the MCP is unreachable: Bitget split records + Nasdaq dividend history. */
async function liveCorporateFallback(inst: VerifiedInstrument) {
  const hit = fallbackCorpCache.get(inst.underlying);
  if (hit !== undefined) return hit;
  try {
    const splits = await getBitgetSplitRecords();
    const divs = await getNasdaqDividends(inst.underlying, inst.underlyingAssetClass);
    const v = {
      exDates: [
        ...splits.records.filter((r) => r.symbol === inst.symbol).map((r) => ({ date: r.exDate, what: `${r.type} ratio ${r.adjustmentRatio} (Bitget)` })),
        ...divs.rows.map((d) => ({ date: d.exDate, what: `ex-dividend ${d.amount} (Nasdaq)` })),
      ],
      retrievedAt: divs.receipt.retrievedAt,
    };
    fallbackCorpCache.set(inst.underlying, v);
    return v;
  } catch {
    return null;
  }
}

export interface LiveProvenance {
  label: string;
  source: string;
  retrievedAt: string | null;
  status: "OK" | "FAILED" | "SNAPSHOT";
  detail: string;
}

export async function liveCalendar() {
  const hit = calendarCache.get("cal");
  if (hit) return hit;
  // Reality endpoints allow 1 request/second/IP: call sequentially with spacing.
  const cal = await getMarketCalendar();
  await new Promise((r) => setTimeout(r, 1100));
  const states = await getMarketStates();
  const v = { closures: calendarClosures(cal.data), states: states.data, retrievedAt: cal.receipt.retrievedAt };
  calendarCache.set("cal", v);
  return v;
}

/** One shared read-only Agent Hub MCP process per server; restarted after a failure. */
let agentPromise: Promise<BitgetAgentMcp> | null = null;
async function agentClient(): Promise<BitgetAgentMcp> {
  agentPromise ??= (async () => {
    const a = new BitgetAgentMcp();
    await a.connect();
    return a;
  })();
  try {
    return await agentPromise;
  } catch (e) {
    agentPromise = null;
    throw e;
  }
}

export type CandleSource = "AGENT_MCP" | "DIRECT_V3";

/**
 * Recent closed 15m bars (up to 1000, about ten days). Primary source: Bitget Agent Hub MCP market.candles
 * (official AI tool, read-only, no credentials). Fallback: the same public v3 endpoint called directly.
 */
export async function liveBars(symbol: string): Promise<{ bars: Bar[]; retrievedAt: string; source: CandleSource; agentError: string | null; sha256: string | null }> {
  const hit = candleCache.get(symbol);
  if (hit) return hit;
  let agentError: string | null = null;
  try {
    const agent = await agentClient();
    const { receipt, data } = await agent.market("candles", { category: "SPOT", symbol, interval: "15m", type: "market", limit: "1000" }, "Live 15m bars for the weekend decision price");
    const rows = Array.isArray(data) ? data.map((r) => RawCandleRow.safeParse(r)).filter((p) => p.success).map((p) => p.data) : [];
    if (receipt.outcome === "OK" && rows.length) {
      const norm = normalizeCandles(rows, Date.parse(receipt.calledAt) + receipt.durationMs);
      const v = { bars: norm.bars, retrievedAt: receipt.calledAt, source: "AGENT_MCP" as const, agentError: null, sha256: receipt.contentSha256 };
      candleCache.set(symbol, v);
      return v;
    }
    agentError = receipt.error ?? "empty response";
  } catch (e) {
    agentError = e instanceof Error ? e.message : String(e);
    agentPromise = null;
  }
  const res = await getCandles(symbol, { history: false, limit: 1000 });
  const norm = normalizeCandles(res.rows, res.requestTime);
  const v = { bars: norm.bars, retrievedAt: res.receipt.retrievedAt, source: "DIRECT_V3" as const, agentError, sha256: null };
  candleCache.set(symbol, v);
  return v;
}

async function liveAnchor(inst: VerifiedInstrument, lastTradingDay: string) {
  const key = `${inst.underlying}:${lastTradingDay}`;
  const hit = anchorCache.get(key);
  if (hit !== undefined) return hit;
  const from = new Date(Date.parse(lastTradingDay) - 6 * 86_400_000).toISOString().slice(0, 10);
  const h = await getDailyHistory(inst.underlying, inst.underlyingAssetClass, from, lastTradingDay);
  const row = h.bars.find((b) => b.date === lastTradingDay) ?? null;
  const v = row ? { close: row.close, date: row.date } : null;
  anchorCache.set(key, v);
  return v;
}

/** Circuit breaker: after a failed MCP connection, skip new attempts for 5 minutes. */
const MCP_BACKOFF_MS = 5 * 60_000;
let mcpFailedAt = 0;

async function liveCorporate(underlying: string) {
  const hit = corpCache.get(underlying);
  if (hit) return hit;
  if (Date.now() - mcpFailedAt < MCP_BACKOFF_MS) return { status: "UNKNOWN" as const, events: [], receipt: null };
  const mcp = new BitgetMcp(15_000);
  try {
    await mcp.connect();
    const r = await mcp.query("equity_fundamental_dividends", { symbol: underlying, start_time: Date.now() - 30 * 86_400_000, end_time: Date.now() + 30 * 86_400_000 }, `Live corporate-action check for ${underlying}`);
    const ok = r.outcome === "OK" || r.outcome === "NO_DATA";
    const rows = ((r.result as { results?: unknown[] } | null)?.results ?? []).map((x) => CorporateEventRow.safeParse(x)).filter((p) => p.success).map((p) => p.data);
    const v = { status: ok ? ("OK" as const) : ("UNKNOWN" as const), events: rows, receipt: r };
    corpCache.set(underlying, v);
    return v;
  } catch {
    mcpFailedAt = Date.now();
    return { status: "UNKNOWN" as const, events: [], receipt: null };
  } finally {
    await mcp.close();
  }
}

/**
 * Verify the session clock against Bitget. Bitget's states endpoint must list a 09:30-16:00 regular session.
 * Its daylightType field is compared with the IANA offset; a disagreement is resolved only when the latest
 * completed regular open in Bitget candles shows the turnover step at the IANA-computed 09:30 ET bar.
 */
export function verifySessionClock(now: number, states: { daylightType: string; stateList: { state: string; startTime: string; endTime: string }[] } | null, idx: BarIndex, lastReopenMs: number | null) {
  const notes: string[] = [];
  if (!states) return { verified: false, notes: ["Bitget market states unavailable"] };
  const regular = states.stateList.find((s) => s.state === "regular");
  if (!regular || regular.startTime !== "09:30" || regular.endTime !== "16:00") return { verified: false, notes: ["Bitget regular session is not listed as 09:30-16:00"] };
  const ianaDst = etOffsetHours(now) === -4;
  const bitgetDst = /dst|daylight|summer/i.test(states.daylightType);
  if (ianaDst === bitgetDst) {
    notes.push(`Bitget daylightType "${states.daylightType}" agrees with America/New_York`);
    return { verified: true, notes };
  }
  notes.push(`Bitget daylightType "${states.daylightType}" disagrees with America/New_York (${ianaDst ? "EDT" : "EST"})`);
  if (lastReopenMs === null) return { verified: false, notes: [...notes, "No completed regular open to check"] };
  const prior = idx.range(lastReopenMs - 4 * BAR_MS, lastReopenMs).map((b) => b.quoteTurnover ?? 0);
  const open = idx.starting(lastReopenMs);
  const jump = open?.quoteTurnover && prior.length ? open.quoteTurnover / Math.max(median(prior), 1) : 0;
  if (jump >= 5) {
    notes.push(`Resolved by candle evidence: turnover stepped up ${jump.toFixed(0)}x at the IANA 09:30 ET bar of the latest reopening`);
    return { verified: true, notes };
  }
  return { verified: false, notes: [...notes, "Candle evidence did not confirm the regular-open boundary"] };
}

export async function gatherLive(ds: Dataset, inst: VerifiedInstrument, now: number): Promise<{ inputs: LiveInputs; provenance: LiveProvenance[] }> {
  const prov: LiveProvenance[] = [];
  let cal: Awaited<ReturnType<typeof liveCalendar>> | null = null;
  try {
    cal = await liveCalendar();
    prov.push({ label: "Session calendar", source: "Bitget /api/v3/reality/market/calendar + /states", retrievedAt: cal.retrievedAt, status: "OK", detail: `${cal.closures.length} special closures listed` });
  } catch (e) {
    prov.push({ label: "Session calendar", source: "Bitget Reality calendar", retrievedAt: null, status: "FAILED", detail: e instanceof Error ? e.message : "request failed" });
  }
  let bars: Bar[] = [];
  let barsAt = new Date(now).toISOString();
  try {
    const lb = await liveBars(inst.symbol);
    bars = lb.bars;
    barsAt = lb.retrievedAt;
    prov.push(
      lb.source === "AGENT_MCP"
        ? { label: "Token 15m candles", source: "Bitget Agent Hub MCP market.candles (official AI tool, read-only, no credentials)", retrievedAt: lb.retrievedAt, status: "OK", detail: `${lb.bars.length} closed bars; sha256 ${lb.sha256?.slice(0, 12) ?? "n/a"}` }
        : { label: "Token 15m candles", source: "Bitget /api/v3/market/candles (direct fallback)", retrievedAt: lb.retrievedAt, status: "OK", detail: `${lb.bars.length} closed bars; Agent Hub MCP unavailable: ${lb.agentError ?? "unknown"}` },
    );
  } catch (e) {
    prov.push({ label: "Token 15m candles", source: "Bitget /api/v3/market/candles", retrievedAt: null, status: "FAILED", detail: e instanceof Error ? e.message : "request failed" });
  }
  const merged = new Map<number, Bar>();
  for (const b of ds.bars[inst.symbol]?.bars ?? []) merged.set(b.ts, b);
  for (const b of bars) merged.set(b.ts, b);
  const idx = new BarIndex([...merged.values()].sort((a, b) => a.ts - b.ts));
  const st = sessionStateAt(now, cal?.closures ?? null);
  // Latest completed regular reopening before now, used for clock verification.
  const completed = sessionsBetween(now - 21 * 86_400_000, now, cal?.closures ?? null).filter((s) => s.endpointMs < now);
  const lastReopen = completed.at(-1)?.reopenMs ?? null;
  const verification = verifySessionClock(now, cal?.states ?? null, idx, lastReopen);

  let anchor: { close: number; date: string } | null = null;
  if (st.session) {
    try {
      anchor = await liveAnchor(inst, st.session.lastTradingDay);
      prov.push({ label: "Underlying official close", source: "Nasdaq.com historical quotes", retrievedAt: new Date().toISOString(), status: anchor ? "OK" : "FAILED", detail: anchor ? `${inst.underlying} close ${anchor.close} on ${anchor.date}` : "No close for the last trading day" });
    } catch (e) {
      prov.push({ label: "Underlying official close", source: "Nasdaq.com historical quotes", retrievedAt: null, status: "FAILED", detail: e instanceof Error ? e.message : "request failed" });
    }
  }
  let corporateLive: LiveInputs["corporateLive"] = null;
  if (st.session) {
    const c = await liveCorporate(inst.underlying);
    const s = st.session;
    if (c.status !== "OK") {
      const fb = await liveCorporateFallback(inst);
      if (!fb) corporateLive = { status: "UNKNOWN", detail: "Bitget AI MCP unreachable and fallback corporate-action sources failed" };
      else {
        const hits = fb.exDates.filter((e) => e.date > s.lastTradingDay && e.date <= s.nextTradingDay);
        corporateLive = hits.length
          ? { status: "AFFECTED", detail: `${hits.map((h) => `${h.what} ${h.date}`).join("; ")} [fallback sources]` }
          : { status: "CLEAR", detail: "No split or ex-dividend date between the last close and the reopening [Bitget split records + Nasdaq dividend history, live]. Bitget AI MCP unreachable; fallback sources used." };
        prov.push({ label: "Corporate actions (fallback)", source: "Bitget /api/v3/market/split-records + Nasdaq.com dividend history", retrievedAt: fb.retrievedAt, status: "OK", detail: "Used because the Bitget AI MCP was unreachable" });
      }
    } else {
      const hits = c.events.filter((e) => {
        const d = e.split_valid_date ?? e.ex_dividend_date;
        return d !== null && d > s.lastTradingDay && d <= s.nextTradingDay;
      });
      corporateLive = hits.length
        ? { status: "AFFECTED", detail: hits.map((h) => `${h.event_type ?? "event"} ${h.split_valid_date ?? h.ex_dividend_date}`).join("; ") }
        : { status: "CLEAR", detail: "No split or ex-dividend date between the last close and the reopening (Bitget AI MCP, live)" };
    }
    prov.push({ label: "Corporate actions", source: "Bitget AI MCP do_query equity_fundamental_dividends", retrievedAt: c.receipt?.calledAt ?? null, status: c.status === "OK" ? "OK" : "FAILED", detail: c.receipt ? `${c.receipt.outcome}, sha256 ${c.receipt.contentSha256?.slice(0, 12) ?? "n/a"}` : "connection failed" });
  }
  return {
    inputs: {
      now,
      liveBars: bars,
      liveRetrievedAt: barsAt,
      closures: cal?.closures ?? null,
      sessionVerification: verification,
      underlyingFridayClose: anchor,
      corporateLive,
    },
    provenance: prov,
  };
}
