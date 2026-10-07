import { z } from "zod";
import { fetchJson } from "./http";
import type { Receipt } from "./bitget";

/**
 * Fallback corporate-action sources, used only when the Bitget AI MCP is unreachable and as a cross-check:
 *  - Bitget Reality split records: GET /api/v3/market/split-records (exchange-side splits and reverse splits)
 *  - Nasdaq.com dividend history: GET /api/quote/{ticker}/dividends (cash dividend ex-dates)
 */
const SplitRecord = z.object({
  symbol: z.string(),
  type: z.string(),
  status: z.string(),
  adjustmentRatio: z.string(),
  exDividendDate: z.string().regex(/^\d{8}$/),
  exDividendDateTimezone: z.string().optional(),
});

export async function getBitgetSplitRecords() {
  const url = "https://api.bitget.com/api/v3/market/split-records";
  const { body, status, retrievedAtMs } = await fetchJson(url, { timeoutMs: 10_000 });
  const parsed = z.object({ code: z.string(), data: z.array(SplitRecord).nullable() }).parse(body);
  if (parsed.code !== "00000") throw new Error(`split-records returned ${parsed.code}`);
  const records = (parsed.data ?? []).map((r) => ({ ...r, exDate: `${r.exDividendDate.slice(0, 4)}-${r.exDividendDate.slice(4, 6)}-${r.exDividendDate.slice(6, 8)}` }));
  const receipt: Receipt = { source: "Bitget public market data (v3)", endpoint: "/api/v3/market/split-records", params: {}, retrievedAt: new Date(retrievedAtMs).toISOString(), httpStatus: status, apiCode: parsed.code, rows: records.length };
  return { records, raw: body, receipt };
}

const DivRow = z.object({ exOrEffDate: z.string(), type: z.string(), amount: z.string(), currency: z.string().optional() });

export async function getNasdaqDividends(ticker: string, assetClass: "stocks" | "etf") {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/dividends?assetclass=${assetClass}`;
  const { body, status, retrievedAtMs } = await fetchJson(url, { timeoutMs: 12_000, headers: { "User-Agent": "Mozilla/5.0 (research; reanchor)" } });
  const parsed = z
    .object({ data: z.object({ dividends: z.object({ rows: z.array(DivRow).nullable() }).nullable() }).nullable(), status: z.object({ rCode: z.number() }) })
    .parse(body);
  if (parsed.status.rCode !== 200 || !parsed.data) throw new Error(`Nasdaq dividends rCode ${parsed.status.rCode}`);
  const rows = (parsed.data.dividends?.rows ?? [])
    .filter((r) => /^\d{2}\/\d{2}\/\d{4}$/.test(r.exOrEffDate))
    .map((r) => {
      const [m, d, y] = r.exOrEffDate.split("/");
      return { exDate: `${y}-${m}-${d}`, type: r.type, amount: r.amount, currency: r.currency ?? null };
    });
  const receipt: Receipt = { source: "Nasdaq.com dividend history", endpoint: `/api/quote/${ticker}/dividends`, params: { assetclass: assetClass }, retrievedAt: new Date(retrievedAtMs).toISOString(), httpStatus: status, rows: rows.length };
  return { rows, raw: body, receipt };
}
