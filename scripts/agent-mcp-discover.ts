/**
 * One-time discovery of the official Bitget Agent Hub MCP server (@bitget-ai/bitget-agent-mcp), launched locally
 * over stdio in --read-only mode with NO API credentials. Lists tools and the market verb's operations.
 * Output: evidence/agent-mcp-discovery.json. Catalog discovery is not counted as research integration.
 */
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, log, writeJsonAtomic } from "./lib/fsx";

async function main() {
  // Strip any Bitget credentials from the child environment: market data is public; nothing may sign requests.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !/BITGET_(API|SECRET|PASS)/i.test(k))) as Record<string, string>;
  const transport = new StdioClientTransport({ command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["-y", "@bitget-ai/bitget-agent-mcp@3.3.1", "--read-only"], env, stderr: "pipe" });
  const client = new Client({ name: "reanchor-discovery", version: "1.0.0" });
  await client.connect(transport);
  const info = client.getServerVersion();
  const tools = await client.listTools();
  const out: Record<string, unknown> = { at: new Date().toISOString(), server: info, readOnly: true, credentials: "none", tools: tools.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  log(`server ${JSON.stringify(info)}; tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  const discover = tools.tools.find((t) => t.name === "discover");
  if (discover) {
    for (const args of [{}, { verb: "market" }, { intent: "market" }]) {
      try {
        const r = await client.callTool({ name: "discover", arguments: args });
        const text = ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("");
        (out.discover ??= [] as unknown[]) as unknown[];
        (out.discover as unknown[]).push({ args, isError: r.isError ?? false, text });
        log(`discover ${JSON.stringify(args)} -> ${r.isError ? "error" : "ok"} (${text.length} chars)`);
      } catch (e) {
        (out.discover ??= [] as unknown[]) as unknown[];
        (out.discover as unknown[]).push({ args, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  writeJsonAtomic(join(ROOT, "evidence", "agent-mcp-discovery.json"), out);
  await client.close();
}

main().catch((e) => {
  console.error("agent-mcp discovery failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
