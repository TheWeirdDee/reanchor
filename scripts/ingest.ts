/**
 * Data ingestion (calls Bitget public market data, Nasdaq.com and the Bitget AI MCP server).
 * Safe to rerun: all outputs are staged and only promoted when every required step succeeds.
 * Outputs: data/bars.json, data/anchors.json, data/corporate-actions.json, data/tool-receipts.json,
 *          data/ingest-status.json, data/raw/** (local retention).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { InstrumentsFile } from "../src/domain/instruments";
import { normalizeCandles, toTuple, type Bar, type NormalizeIssue } from "../src/domain/candles";
import { sessionStateAt, weekendSessionFor } from "../src/domain/calendar";
import { addDays, BAR_MS, etParts, HOUR } from "../src/domain/time";
import { getCandles } from "../src/server/bitget";
import { getDailyHistory } from "../src/server/nasdaq";
import { pullCorporateFallback, pullMcp, type McpPull } from "./lib/mcp-pull";
import { DATA, RAW, log, pacer, readJson, readJsonIfExists, writeJsonAtomic } from "./lib/fsx";

const STAGE = join(DATA, ".staging");
const PAGE_BARS = 100;

interface CandlePage {
  params: Record<string, string>;
  retrievedAt: string;
  requestTime: number;
  rows: unknown[];
}

async function pullCandles(symbol: string, fromMs: number, toMs: number, pace: () => Promise<void>) {
  const pages: CandlePage[] = [];
  const all: Bar[] = [];
  const issues: NormalizeIssue[] = [];
  let identicalDupes = 0;
  for (let start = fromMs; start < toMs; start += PAGE_BARS * BAR_MS) {
    const end = Math.min(start + PAGE_BARS * BAR_MS - 1, toMs);
    await pace();
    const res = await getCandles(symbol, { history: true, startTime: start, endTime: end, limit: PAGE_BARS });
    pages.push({ params: res.receipt.params, retrievedAt: res.receipt.retrievedAt, requestTime: res.requestTime, rows: res.rows });
    const n = normalizeCandles(res.rows, res.requestTime);
    // Keep only rows inside the requested window to make pagination unambiguous.
    all.push(...n.bars.filter((b) => b.ts >= start && b.ts <= end));
    issues.push(...n.issues);
    identicalDupes += n.duplicatesIdentical;
  }
  // Merge pages: detect cross-page conflicting duplicates.
  const merged = normalizeCandles(
    all.map((b) => [String(b.ts), String(b.open), String(b.high), String(b.low), String(b.close), b.baseVolume === null ? "" : String(b.baseVolume), b.quoteTurnover === null ? "" : String(b.quoteTurnover)] as never),
    Number.POSITIVE_INFINITY,
  );
  issues.push(...merged.issues);
  return { pages, bars: merged.bars, issues, identicalDupes: identicalDupes + merged.duplicatesIdentical };
}

/** Keep bars from 12:00 ET on the last trading day before each weekend through 12:00 ET on the reopening day. */
function weekendWindows(bars: Bar[], closures: { startEt: string; endEt: string }[]) {
  if (!bars.length) return [];
  const windows: [number, number][] = [];
  let sat = etParts(bars[0].ts).date;
  while (new Date(sat + "T00:00:00Z").getUTCDay() !== 6) sat = addDays(sat, 1);
  sat = addDays(sat, -7);
  const lastTs = bars[bars.length - 1].ts;
  for (; ; sat = addDays(sat, 7)) {
    const s = weekendSessionFor(sat, closures);
    if (!s) break;
    if (s.startMs - 8 * HOUR > lastTs) break;
    windows.push([s.startMs - 8 * HOUR, s.reopenMs + 3 * HOUR]);
  }
  return bars.filter((b) => windows.some(([a, z]) => b.ts >= a && b.ts < z));
}

const CORP_SOURCE = "Bitget AI MCP (bitget-mcp-server) do_query equity_fundamental_dividends / equity_calendar";

/**
 * Build corporate-action and receipt files. A failed MCP run never replaces a previously valid snapshot:
 * the old successful files are kept and the failed attempt is appended to the receipt log.
 */
function mcpOutputsPreservingValid(p: McpPull) {
  const prevCorp = readJsonIfExists<{ retrievedAt: string; byUnderlying: Record<string, { status: string }> }>(join(DATA, "corporate-actions.json"));
  const prevReceipts = readJsonIfExists<{ attempts?: unknown[] } & Record<string, unknown>>(join(DATA, "tool-receipts.json"));
  const prevOk = prevCorp && Object.values(prevCorp.byUnderlying).length > 0 && Object.values(prevCorp.byUnderlying).every((c) => c.status === "OK");
  const attempt = { attemptedAt: p.info.attemptedAt, connected: p.info.connected, error: p.info.error, allOk: p.allOk, calls: p.receipts.length };
  const attempts = [...(prevReceipts?.attempts ?? []), attempt];
  // Preserve every earlier run's individual receipts: the replaced run moves into receiptHistory.
  const receiptHistory = [
    ...((prevReceipts?.receiptHistory as unknown[] | undefined) ?? []),
    ...(prevReceipts?.receipts ? [{ generatedAt: prevReceipts.generatedAt ?? null, receipts: prevReceipts.receipts }] : []),
  ];
  if (!p.allOk && prevOk) {
    log("MCP run incomplete; keeping the previous valid corporate-action snapshot");
    return {
      corporateFile: prevCorp,
      receiptsFile: { ...prevReceipts, attempts, failedRunReceipts: [...((prevReceipts?.failedRunReceipts as unknown[] | undefined) ?? []), { attemptedAt: attempt.attemptedAt, receipts: p.receipts }] },
      statusNote: { ...attempt, usedSnapshotFrom: prevCorp!.retrievedAt },
    };
  }
  return {
    corporateFile: { source: CORP_SOURCE, retrievedAt: new Date().toISOString(), byUnderlying: p.corporate },
    receiptsFile: { generatedAt: new Date().toISOString(), server: { url: "https://agent.bitget.com/mcp", ...(p.info.server as object | null ?? {}) }, toolsListed: p.info.tools, toolSchemas: p.info.toolSchemas, receipts: p.receipts, attempts, receiptHistory },
    statusNote: attempt,
  };
}

/** --mcp-only: refresh only the Bitget AI MCP outputs, leaving candles and anchors untouched. */
async function mcpOnly() {
  const inst = readJson<InstrumentsFile>(join(DATA, "instruments.json"));
  const supported = inst.instruments.filter((i) => i.supported);
  const p = await pullMcp(supported, Date.now());
  const out = mcpOutputsPreservingValid(p);
  writeJsonAtomic(join(DATA, "corporate-actions.json"), out.corporateFile);
  writeJsonAtomic(join(DATA, "tool-receipts.json"), out.receiptsFile);
  writeJsonAtomic(join(DATA, "corporate-fallback.json"), await pullCorporateFallback(supported));
  const status = readJson<Record<string, unknown>>(join(DATA, "ingest-status.json"));
  writeJsonAtomic(join(DATA, "ingest-status.json"), { ...status, mcp: out.statusNote });
  log(p.allOk ? "MCP refresh complete." : "MCP refresh did not complete; see data/tool-receipts.json attempts.");
  if (!p.allOk) process.exitCode = 2;
}

async function main() {
  const startedAt = new Date().toISOString();
  const inst = readJson<InstrumentsFile>(join(DATA, "instruments.json"));
  const supported = inst.instruments.filter((i) => i.supported);
  if (!supported.length) throw new Error("No identity-verified instruments; run data:discover first");
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  const pace = pacer(8); // documented limit 20 requests/second/IP; stay well below
  const now = Date.now();
  const toMs = Math.floor(now / BAR_MS) * BAR_MS - 1;
  const bars: Record<string, ReturnType<typeof toTuple>[]> = {};
  const coverage: Record<string, unknown> = {};
  const receiptsHttp: unknown[] = [];

  for (const i of supported) {
    const from = Math.floor((i.launchTimeMs ?? now - 180 * 24 * HOUR) / BAR_MS) * BAR_MS;
    log(`${i.symbol}: pulling 15m history-candles from ${new Date(from).toISOString()}`);
    const r = await pullCandles(i.symbol, from, toMs, pace);
    writeJsonAtomic(join(STAGE, "raw", "candles", `${i.symbol}.json`), { symbol: i.symbol, endpoint: "/api/v3/market/history-candles", pages: r.pages }, false);
    receiptsHttp.push({ source: "Bitget public market data (v3)", endpoint: "/api/v3/market/history-candles", symbol: i.symbol, pages: r.pages.length, firstRetrievedAt: r.pages[0]?.retrievedAt, lastRetrievedAt: r.pages.at(-1)?.retrievedAt });
    const kept = weekendWindows(r.bars, inst.marketCalendar.closures);
    bars[i.symbol] = kept.map(toTuple);
    const first = r.bars[0]?.ts ?? null;
    const last = r.bars.at(-1)?.ts ?? null;
    const expected = first !== null && last !== null ? (last - first) / BAR_MS + 1 : 0;
    const firstTurnover = r.bars.find((b) => b.quoteTurnover !== null && b.quoteTurnover > 0)?.ts ?? null;
    coverage[i.symbol] = {
      earliestClosedBarStart: first && new Date(first).toISOString(),
      latestClosedBarStart: last && new Date(last).toISOString(),
      barsReceived: r.bars.length,
      intervalsInSpan: expected,
      missingIntervals: expected - r.bars.length,
      firstPositiveTurnoverBar: firstTurnover && new Date(firstTurnover).toISOString(),
      barsWithNullTurnover: r.bars.filter((b) => b.quoteTurnover === null).length,
      barsWithZeroTurnover: r.bars.filter((b) => b.quoteTurnover === 0).length,
      identicalDuplicates: r.identicalDupes,
      issues: summarizeIssues(r.issues),
      weekendWindowBarsKept: kept.length,
    };
    log(`${i.symbol}: ${r.bars.length} closed bars, ${expected - r.bars.length} missing intervals, ${r.issues.length} issues`);
  }

  // Underlying anchors (independent reference).
  const anchors: Record<string, { date: string; open: number; close: number }[]> = {};
  const anchorReceipts: unknown[] = [];
  for (const i of supported) {
    const from = new Date((i.launchTimeMs ?? now) - 10 * 24 * HOUR).toISOString().slice(0, 10);
    const to = new Date(now).toISOString().slice(0, 10);
    try {
      const h = await getDailyHistory(i.underlying, i.underlyingAssetClass, from, to);
      writeJsonAtomic(join(STAGE, "raw", "nasdaq", `${i.underlying}.json`), h.raw);
      anchors[i.underlying] = h.bars;
      anchorReceipts.push(h.receipt);
      log(`${i.underlying}: ${h.bars.length} official daily bars from Nasdaq.com`);
    } catch (e) {
      anchorReceipts.push({ source: "Nasdaq.com historical quotes", ticker: i.underlying, error: e instanceof Error ? e.message : String(e) });
      log(`${i.underlying}: anchor fetch failed (${e instanceof Error ? e.message : e})`);
    }
  }

  // Bitget AI MCP: corporate actions, earnings dates, reference quote, historical attempt.
  const mcpPull = await pullMcp(supported, now);
  const mcpOutputs = mcpOutputsPreservingValid(mcpPull);
  const fallback = await pullCorporateFallback(supported);

  const session = sessionStateAt(now, inst.marketCalendar.closures);
  const status = {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: true,
    dataMode: "SNAPSHOT",
    sessionPhaseAtPull: session.phase,
    instruments: supported.map((i) => i.symbol),
    coverage,
    httpReceipts: [...receiptsHttp, ...anchorReceipts],
    mcp: mcpOutputs.statusNote,
  };

  writeJsonAtomic(join(STAGE, "bars.json"), { granularity: "15m", tupleFields: ["tsStartUtcMs", "open", "high", "low", "close", "baseVolume", "quoteTurnoverUsdt"], symbols: bars }, false);
  writeJsonAtomic(join(STAGE, "anchors.json"), { source: "Nasdaq.com historical quotes (official daily open/close, USD, unadjusted as displayed)", retrievedAt: new Date().toISOString(), daily: anchors });
  writeJsonAtomic(join(STAGE, "corporate-actions.json"), mcpOutputs.corporateFile);
  writeJsonAtomic(join(STAGE, "tool-receipts.json"), mcpOutputs.receiptsFile);
  writeJsonAtomic(join(STAGE, "corporate-fallback.json"), fallback);
  writeJsonAtomic(join(STAGE, "ingest-status.json"), status);

  // Promote staged files only after every required step succeeded.
  for (const f of ["bars.json", "anchors.json", "corporate-actions.json", "corporate-fallback.json", "tool-receipts.json", "ingest-status.json"]) {
    renameSync(join(STAGE, f), join(DATA, f));
  }
  for (const sub of ["candles", "nasdaq"]) {
    const src = join(STAGE, "raw", sub);
    if (!existsSync(src)) continue;
    const dst = join(RAW, sub);
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(RAW, { recursive: true });
    renameSync(src, dst);
  }
  rmSync(STAGE, { recursive: true, force: true });
  log("Ingest complete; outputs promoted.");
}

function summarizeIssues(issues: NormalizeIssue[]) {
  const out: Record<string, number> = {};
  for (const i of issues) out[i.code] = (out[i.code] ?? 0) + 1;
  return out;
}

(process.argv.includes("--mcp-only") ? mcpOnly() : main()).catch((e) => {
  console.error("Ingest failed; previous dataset left untouched:", e instanceof Error ? e.stack : e);
  try {
    writeJsonAtomic(join(DATA, "ingest-last-failure.json"), { failedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
