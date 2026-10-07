import { createHash } from "node:crypto";
import { installDnsFallback } from "./net";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Read-only client for Bitget's AI data MCP server (bitget-mcp-server).
 * Only catalog entries on this allowlist can be executed; there is no trading, transfer or account path.
 */
export const MCP_URL = "https://agent.bitget.com/mcp";
installDnsFallback();

export const ALLOWED_ENTRIES = [
  "equity_fundamental_dividends",
  "equity_calendar",
  "equity_price_quote",
  "equity_price_historical",
] as const;
export type AllowedEntry = (typeof ALLOWED_ENTRIES)[number];

export interface ToolReceipt {
  id: string;
  server: { url: string; name: string | null; version: string | null };
  tool: string;
  entryId: string | null;
  arguments: Record<string, unknown>;
  calledAt: string;
  durationMs: number;
  outcome: "OK" | "NO_DATA" | "ERROR";
  statusCode: number | null;
  error: string | null;
  /** SHA-256 of the exact text content returned by the tool. */
  contentSha256: string | null;
  /** Sanitized, schema-validated payload used by the research flow. */
  result: unknown;
  validation: string[];
  usedFor: string;
}

const DoQueryEnvelope = z.object({
  success: z.boolean(),
  status_code: z.number().nullable(),
  data: z.unknown(),
  error: z.unknown().nullable(),
});

export const CorporateEventRow = z.object({
  symbol: z.string(),
  ex_dividend_date: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  event_type: z.string().nullable(),
  split_valid_date: z.string().nullable(),
  split_numerator: z.union([z.string(), z.number()]).nullable(),
  split_denominator: z.union([z.string(), z.number()]).nullable(),
  stock_dividend_ps: z.number().nullable().optional(),
});
export type CorporateEventRow = z.infer<typeof CorporateEventRow>;

export const EarningsRow = z.object({
  symbol: z.string(),
  period_ending: z.string().nullable(),
  fiscal_year: z.union([z.string(), z.number()]).nullable(),
  report_type_name: z.string().nullable(),
  perf_briefing_fore_dsclsr_date: z.string().nullable().optional(),
  perf_brief_dsclsr_date: z.string().nullable().optional(),
  perf_report_dsclsr_date: z.string().nullable().optional(),
  perf_report_fore_dsclsr_date: z.string().nullable().optional(),
  is_trading_time: z.string().nullable().optional(),
});
export type EarningsRow = z.infer<typeof EarningsRow>;

export const QuoteRow = z.object({
  symbol: z.string(),
  last_price: z.number().nullable(),
  prev_close: z.number().nullable(),
  open: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
  exchange: z.string().nullable().optional(),
  last_timestamp: z.string().nullable().optional(),
});

/** Event type labels returned by the data platform (Chinese): cash dividend, stock split, stock dividend. */
export const EVENT_CASH_DIVIDEND = "现金分红";
export const EVENT_STOCK_SPLIT = "股票拆分";
export const EVENT_STOCK_DIVIDEND = "股票分红";

export class BitgetMcp {
  private client: Client | null = null;
  private serverName: string | null = null;
  private serverVersion: string | null = null;
  tools: { name: string; description?: string; inputSchema: unknown }[] = [];

  constructor(private readonly timeoutMs = 20_000) {}

  async connect(): Promise<void> {
    const client = new Client({ name: "reanchor", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    await withTimeout(client.connect(transport), this.timeoutMs, "MCP connect");
    const info = client.getServerVersion();
    this.serverName = info?.name ?? null;
    this.serverVersion = info?.version ?? null;
    const listed = await withTimeout(client.listTools(), this.timeoutMs, "MCP tools/list");
    this.tools = listed.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    this.client = client;
  }

  get server() {
    return { url: MCP_URL, name: this.serverName, version: this.serverVersion };
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
  }

  /** Read-only catalog call (`guide` with no arguments). Returns a short status string. */
  async client_guide(): Promise<string> {
    if (!this.client) throw new Error("MCP client not connected");
    try {
      const res = await withTimeout(this.client.callTool({ name: "guide", arguments: {} }), this.timeoutMs, "MCP guide");
      const text = ((res.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("");
      const parsed = JSON.parse(text) as { categories?: unknown[] };
      return `OK (${parsed.categories?.length ?? 0} categories)`;
    } catch (e) {
      return `ERROR (${e instanceof Error ? e.message.slice(0, 80) : "unknown"})`;
    }
  }

  async query(entryId: AllowedEntry, params: Record<string, unknown>, usedFor: string): Promise<ToolReceipt> {
    if (!ALLOWED_ENTRIES.includes(entryId)) throw new Error(`Entry ${entryId} is not on the read-only allowlist`);
    if (!this.client) throw new Error("MCP client not connected");
    const args = { entry_id: entryId, params };
    const started = Date.now();
    const base = {
      id: `${entryId}:${JSON.stringify(params)}:${started}`,
      server: this.server,
      tool: "do_query",
      entryId,
      arguments: args,
      calledAt: new Date(started).toISOString(),
      usedFor,
    };
    try {
      const res = await withTimeout(this.client.callTool({ name: "do_query", arguments: args }), this.timeoutMs, `MCP ${entryId}`);
      const text = ((res.content as { type: string; text?: string }[]) ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      const sha = createHash("sha256").update(text).digest("hex");
      const env = DoQueryEnvelope.parse(JSON.parse(text));
      const durationMs = Date.now() - started;
      if (!env.success) {
        return { ...base, durationMs, outcome: "ERROR", statusCode: env.status_code, error: JSON.stringify(env.error ?? env.data).slice(0, 400), contentSha256: sha, result: null, validation: [] };
      }
      if (env.status_code === 204 || env.data === "" || env.data === null) {
        return { ...base, durationMs, outcome: "NO_DATA", statusCode: env.status_code, error: null, contentSha256: sha, result: null, validation: ["Tool returned HTTP 204 / empty data"] };
      }
      const data = z.object({ results: z.array(z.unknown()), extra: z.unknown().optional() }).parse(env.data);
      return { ...base, durationMs, outcome: "OK", statusCode: env.status_code, error: null, contentSha256: sha, result: { results: data.results, metadata: extractMeta(data.extra) }, validation: [] };
    } catch (e) {
      return { ...base, durationMs: Date.now() - started, outcome: "ERROR", statusCode: null, error: e instanceof Error ? e.message : String(e), contentSha256: null, result: null, validation: [] };
    }
  }
}

function extractMeta(extra: unknown) {
  const m = (extra as { metadata?: { route?: string; timestamp?: string; arguments?: { extra_params?: Record<string, unknown> } } })?.metadata;
  if (!m) return null;
  return { route: m.route ?? null, timestamp: m.timestamp ?? null, extraParams: m.arguments?.extra_params ?? null };
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
