import { z } from "zod";
import { fetchJson } from "./http";
import type { Receipt } from "./bitget";

/**
 * Independent underlying-stock reference: Nasdaq.com historical daily quotes (official open and close
 * for Nasdaq-listed securities). Used only for the underlying anchor; never substituted for token prices.
 * Raw responses are retained locally (data/raw is not intended for redistribution).
 */
const Row = z.object({
  date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  close: z.string(),
  open: z.string(),
  high: z.string().optional(),
  low: z.string().optional(),
  volume: z.string().optional(),
});

const Response = z.object({
  data: z
    .object({
      symbol: z.string(),
      tradesTable: z.object({ rows: z.array(Row).nullable() }).nullable(),
    })
    .nullable(),
  status: z.object({ rCode: z.number() }),
});

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
}

const money = (s: string) => {
  const n = Number(s.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid price ${s}`);
  return n;
};

export async function getDailyHistory(ticker: string, assetClass: "stocks" | "etf", fromDate: string, toDate: string) {
  const params = { assetclass: assetClass, fromdate: fromDate, todate: toDate, limit: "400" };
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/historical?${new URLSearchParams(params)}`;
  const { body, status, retrievedAtMs } = await fetchJson(url, {
    timeoutMs: 12_000,
    headers: { "User-Agent": "Mozilla/5.0 (research; reanchor)" },
  });
  const parsed = Response.parse(body);
  if (parsed.status.rCode !== 200 || !parsed.data) throw new Error(`Nasdaq returned rCode ${parsed.status.rCode}`);
  const rows = parsed.data.tradesTable?.rows ?? [];
  const bars: DailyBar[] = rows.map((r) => {
    const [m, d, y] = r.date.split("/");
    return { date: `${y}-${m}-${d}`, open: money(r.open), close: money(r.close) };
  });
  bars.sort((a, b) => a.date.localeCompare(b.date));
  const receipt: Receipt = {
    source: "Nasdaq.com historical quotes",
    endpoint: `/api/quote/${ticker}/historical`,
    params,
    retrievedAt: new Date(retrievedAtMs).toISOString(),
    httpStatus: status,
    rows: bars.length,
  };
  return { bars, raw: body, receipt };
}
