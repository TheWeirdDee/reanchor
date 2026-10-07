import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Read-only client for Bitget's official Agent Hub MCP server (@bitget-ai/bitget-agent-mcp), run locally over
 * stdio with --read-only and no API credentials. Only the public `market` verb is used, with an allowlist of
 * actions. This complements, and does not replace, the Bitget AI data MCP (corporate actions, underlying data),
 * which the Agent Hub catalog does not cover.
 */
export const AGENT_MCP_PACKAGE = "@bitget-ai/bitget-agent-mcp";
export const AGENT_MCP_VERSION = "3.3.1";
export const ALLOWED_MARKET_ACTIONS = ["candles", "candlesHistory", "instruments", "tickers"] as const;
export type MarketAction = (typeof ALLOWED_MARKET_ACTIONS)[number];

export interface AgentReceipt {
  tool: "market";
  server: { name: string | null; version: string | null; package: string; mode: "read-only"; credentials: "none" };
  arguments: Record<string, unknown>;
  calledAt: string;
  durationMs: number;
  outcome: "OK" | "ERROR";
  error: string | null;
  contentSha256: string | null;
  endpoint: string | null;
  rows: number | null;
  usedFor: string;
}

function launchCommand(): { command: string; args: string[] } {
  // Prefer the locally installed package (pinned in package.json); fall back to npx with the pinned version.
  const local = join(process.cwd(), "node_modules", "@bitget-ai", "bitget-agent-mcp", "lib", "index.js");
  if (existsSync(local)) return { command: process.execPath, args: [local, "--read-only"] };
  return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["-y", `${AGENT_MCP_PACKAGE}@${AGENT_MCP_VERSION}`, "--read-only"] };
}

const Envelope = z.object({ ok: z.boolean(), endpoint: z.string().optional(), requestTime: z.string().optional(), data: z.unknown(), error: z.unknown().optional() });

export class BitgetAgentMcp {
  private client: Client | null = null;
  private name: string | null = null;
  private version: string | null = null;

  constructor(private readonly timeoutMs = 25_000) {}

  async connect(): Promise<void> {
    // Strip any Bitget credentials from the child: market data is public and nothing may be signed.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !/BITGET_(API|SECRET|PASS)/i.test(k))) as Record<string, string>;
    const { command, args } = launchCommand();
    const client = new Client({ name: "reanchor", version: "1.0.0" });
    await withTimeout(client.connect(new StdioClientTransport({ command, args, env, stderr: "pipe" })), this.timeoutMs * 3, "Agent MCP start");
    const info = client.getServerVersion();
    this.name = info?.name ?? null;
    this.version = info?.version ?? null;
    this.client = client;
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
  }

  async market(action: MarketAction, params: Record<string, string>, usedFor: string): Promise<{ receipt: AgentReceipt; data: unknown }> {
    if (!ALLOWED_MARKET_ACTIONS.includes(action)) throw new Error(`Market action ${action} is not on the allowlist`);
    if (!this.client) throw new Error("Agent MCP client not connected");
    const args = { action, ...params, view: "full" };
    const started = Date.now();
    const base = {
      tool: "market" as const,
      server: { name: this.name, version: this.version, package: `${AGENT_MCP_PACKAGE}@${AGENT_MCP_VERSION}`, mode: "read-only" as const, credentials: "none" as const },
      arguments: args,
      calledAt: new Date(started).toISOString(),
      usedFor,
    };
    try {
      const r = await withTimeout(this.client.callTool({ name: "market", arguments: args }), this.timeoutMs, `Agent MCP market.${action}`);
      const text = ((r.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      const sha = createHash("sha256").update(text).digest("hex");
      const env = Envelope.safeParse(JSON.parse(text));
      if (r.isError || !env.success || !env.data.ok) {
        return { receipt: { ...base, durationMs: Date.now() - started, outcome: "ERROR", error: text.slice(0, 300), contentSha256: sha, endpoint: null, rows: null }, data: null };
      }
      const data = env.data.data;
      return {
        receipt: { ...base, durationMs: Date.now() - started, outcome: "OK", error: null, contentSha256: sha, endpoint: env.data.endpoint ?? null, rows: Array.isArray(data) ? data.length : null },
        data,
      };
    } catch (e) {
      return { receipt: { ...base, durationMs: Date.now() - started, outcome: "ERROR", error: e instanceof Error ? e.message : String(e), contentSha256: null, endpoint: null, rows: null }, data: null };
    }
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}
