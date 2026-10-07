import type { VerifiedInstrument } from "../../src/domain/instruments";
import { BitgetMcp, EVENT_STOCK_SPLIT, type ToolReceipt } from "../../src/server/mcp";
import { log } from "./fsx";
import { getBitgetSplitRecords, getNasdaqDividends } from "../../src/server/corporate-fallback";

export interface CorporateEntry {
  status: "OK" | "UNKNOWN";
  events: unknown[];
  splitQueryOutcome: string;
  earnings: unknown[];
  error: string | null;
}

export interface McpPull {
  info: { connected: boolean; tools: string[]; toolSchemas: unknown[]; server: unknown; error: string | null; attemptedAt: string };
  receipts: ToolReceipt[];
  corporate: Record<string, CorporateEntry>;
  allOk: boolean;
}

/** Bitget AI MCP research calls: corporate actions, earnings dates, a reference quote and a historical-price attempt. */
export async function pullMcp(supported: VerifiedInstrument[], now: number): Promise<McpPull> {
  const receipts: ToolReceipt[] = [];
  const corporate: Record<string, CorporateEntry> = {};
  const mcp = new BitgetMcp();
  const info: McpPull["info"] = { connected: false, tools: [], toolSchemas: [], server: null, error: null, attemptedAt: new Date().toISOString() };
  try {
    await mcp.connect();
    info.connected = true;
    info.tools = mcp.tools.map((t) => t.name);
    info.toolSchemas = mcp.tools;
    info.server = mcp.server;
    log(`MCP connected: ${JSON.stringify(mcp.server)} tools=${info.tools.join(",")}`);
    const since = Date.UTC(2026, 0, 1);
    for (const i of supported) {
      const all = await mcp.query("equity_fundamental_dividends", { symbol: i.underlying, start_time: since, end_time: now + 60 * 86_400_000 }, `Corporate actions (dividends/splits) for ${i.underlying} to exclude affected weekend episodes`);
      const splits = await mcp.query("equity_fundamental_dividends", { symbol: i.underlying, event_type: EVENT_STOCK_SPLIT }, `Explicit split/reverse-split check for ${i.underlying}`);
      const earn = await mcp.query("equity_calendar", { symbol: i.underlying, start_date: "2026-01-01", end_date: "2027-03-31" }, `Earnings disclosure dates for ${i.underlying} (event context near reopenings)`);
      receipts.push(all, splits, earn);
      const allOk = all.outcome === "OK" || all.outcome === "NO_DATA";
      const splitOk = splits.outcome === "OK" || splits.outcome === "NO_DATA";
      corporate[i.underlying] = {
        status: allOk && splitOk ? "OK" : "UNKNOWN",
        events: [
          ...(((all.result as { results?: unknown[] } | null)?.results) ?? []),
          ...(((splits.result as { results?: unknown[] } | null)?.results) ?? []),
        ],
        splitQueryOutcome: splits.outcome,
        earnings: ((earn.result as { results?: unknown[] } | null)?.results) ?? [],
        error: allOk && splitOk ? null : [all.error, splits.error].filter(Boolean).join("; "),
      };
      log(`${i.underlying}: corporate events ${all.outcome}/${splits.outcome}, earnings ${earn.outcome}`);
    }
    receipts.push(await mcp.query("equity_price_historical", { symbol: "NVDA", start_time: Date.UTC(2026, 8, 1), end_time: now }, "Attempted underlying historical OHLC for official anchors"));
    receipts.push(await mcp.query("equity_price_quote", { symbol: "NVDA" }, "Reference quote; validated against the official Nasdaq close"));
  } catch (e) {
    const c = (e as { cause?: { code?: string } }).cause;
    info.error = `${e instanceof Error ? e.message : String(e)}${c?.code ? ` (${c.code})` : ""}`;
    log(`MCP failure: ${info.error}`);
    for (const i of supported) corporate[i.underlying] ??= { status: "UNKNOWN", events: [], splitQueryOutcome: "ERROR", earnings: [], error: info.error };
  } finally {
    await mcp.close();
  }
  const allOk = supported.every((i) => corporate[i.underlying]?.status === "OK");
  return { info, receipts, corporate, allOk };
}


export interface FallbackFile {
  source: string;
  retrievedAt: string;
  splitRecords: { status: "OK" | "UNKNOWN"; receipt: unknown; error: string | null; records: unknown[] };
  byUnderlying: Record<string, { status: "OK" | "UNKNOWN"; symbol: string; splits: unknown[]; dividends: unknown[]; receipt: unknown; error: string | null }>;
}

/** Fallback corporate-action sources (Bitget split records + Nasdaq dividend history). */
export async function pullCorporateFallback(supported: VerifiedInstrument[]): Promise<FallbackFile> {
  const out: FallbackFile = {
    source: "Bitget /api/v3/market/split-records + Nasdaq.com dividend history",
    retrievedAt: new Date().toISOString(),
    splitRecords: { status: "UNKNOWN", receipt: null, error: null, records: [] },
    byUnderlying: {},
  };
  try {
    const s = await getBitgetSplitRecords();
    out.splitRecords = { status: "OK", receipt: s.receipt, error: null, records: s.records };
  } catch (e) {
    out.splitRecords.error = e instanceof Error ? e.message : String(e);
  }
  for (const i of supported) {
    try {
      const d = await getNasdaqDividends(i.underlying, i.underlyingAssetClass);
      const splits = (out.splitRecords.records as { symbol: string }[]).filter((r) => r.symbol === i.symbol);
      out.byUnderlying[i.underlying] = { status: out.splitRecords.status, symbol: i.symbol, splits, dividends: d.rows, receipt: d.receipt, error: out.splitRecords.error };
      log(`${i.underlying}: fallback corporate data ${d.rows.length} dividend rows, ${splits.length} Bitget split records`);
    } catch (e) {
      out.byUnderlying[i.underlying] = { status: "UNKNOWN", symbol: i.symbol, splits: [], dividends: [], receipt: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
