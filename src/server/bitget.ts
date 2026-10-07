import { z } from "zod";
import { fetchJson } from "./http";
import { RawCandleResponse } from "../domain/candles";

/** Read-only Bitget public market-data adapter. No authenticated or order endpoints exist here. */
export const BITGET_BASE = "https://api.bitget.com";

export interface Receipt {
  source: string;
  endpoint: string;
  params: Record<string, string>;
  retrievedAt: string;
  httpStatus: number;
  apiCode?: string;
  rows?: number;
}

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.string(), msg: z.string(), requestTime: z.number(), data });

export const Instrument = z.object({
  symbol: z.string(),
  category: z.string(),
  baseCoin: z.string(),
  quoteCoin: z.string(),
  symbolType: z.string().optional(),
  buyLimitPriceRatio: z.string(),
  sellLimitPriceRatio: z.string(),
  minOrderQty: z.string(),
  pricePrecision: z.string(),
  quantityPrecision: z.string(),
  quotePrecision: z.string().optional(),
  minOrderAmount: z.string(),
  status: z.string(),
  isReality: z.string().optional(),
  launchTime: z.string().optional(),
});
export type Instrument = z.infer<typeof Instrument>;

export const StockInfo = z.object({
  symbol: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  tradingPeriod: z.array(z.string()),
  weekendTradable: z.string(),
});

export const MarketStates = z.object({
  market: z.string(),
  daylightType: z.string(),
  stateList: z.array(z.object({ state: z.string(), timeZone: z.string(), startTime: z.string(), endTime: z.string() })),
});

export const MarketCalendar = z.object({
  timeZone: z.string(),
  specificConfig: z.array(z.object({ remark: z.string().nullable().optional(), startTime: z.string(), endTime: z.string() })),
  regularConfig: z.array(z.string()),
});

async function get<T extends z.ZodTypeAny>(path: string, params: Record<string, string>, schema: T, timeoutMs = 10_000) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BITGET_BASE}${path}${qs ? `?${qs}` : ""}`;
  const { body, status, retrievedAtMs } = await fetchJson(url, { timeoutMs });
  const parsed = envelope(schema).parse(body) as { code: string; msg: string; requestTime: number; data: unknown };
  if (parsed.code !== "00000") throw new Error(`Bitget ${path} returned code ${parsed.code}: ${parsed.msg}`);
  const receipt: Receipt = {
    source: "Bitget public market data (v3)",
    endpoint: path,
    params,
    retrievedAt: new Date(retrievedAtMs).toISOString(),
    httpStatus: status,
    apiCode: parsed.code,
    rows: Array.isArray(parsed.data) ? parsed.data.length : undefined,
  };
  return { data: parsed.data as z.infer<T>, raw: body, receipt, requestTime: parsed.requestTime };
}

export const getInstruments = () => get("/api/v3/market/instruments", { category: "SPOT" }, z.array(Instrument), 20_000);
export const getStockInfo = (symbol: string) => get("/api/v3/reality/market/stock-info", { symbol }, z.array(StockInfo));
export const getMarketStates = () => get("/api/v3/reality/market/states", {}, MarketStates);
export const getMarketCalendar = () => get("/api/v3/reality/market/calendar", {}, MarketCalendar);

export async function getCandles(
  symbol: string,
  opts: { history: boolean; startTime?: number; endTime?: number; limit: number },
) {
  const params: Record<string, string> = { category: "SPOT", symbol, interval: "15m", type: "market", limit: String(opts.limit) };
  if (opts.startTime !== undefined) params.startTime = String(opts.startTime);
  if (opts.endTime !== undefined) params.endTime = String(opts.endTime);
  const path = opts.history ? "/api/v3/market/history-candles" : "/api/v3/market/candles";
  const qs = new URLSearchParams(params).toString();
  const url = `${BITGET_BASE}${path}?${qs}`;
  const { body, status, retrievedAtMs } = await fetchJson(url, { timeoutMs: 12_000 });
  const parsed = RawCandleResponse.parse(body);
  if (parsed.code !== "00000") throw new Error(`Bitget ${path} returned code ${parsed.code}: ${parsed.msg}`);
  const receipt: Receipt = {
    source: "Bitget public market data (v3)",
    endpoint: path,
    params,
    retrievedAt: new Date(retrievedAtMs).toISOString(),
    httpStatus: status,
    apiCode: parsed.code,
    rows: parsed.data?.length ?? 0,
  };
  return { rows: parsed.data ?? [], raw: body, receipt, requestTime: parsed.requestTime };
}

/** Convert Bitget calendar entries to ET wall-time closure windows. Bitget labels the zone "EST" but values are New York wall time (see DATA_GATE.md). */
export function calendarClosures(cal: z.infer<typeof MarketCalendar>) {
  return cal.specificConfig.map((c) => ({ startEt: c.startTime, endEt: c.endTime }));
}
