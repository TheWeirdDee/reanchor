/**
 * Bounded MCP availability probe through the app's own client (read-only allowlisted entry).
 * Attempts: up to MAX_ATTEMPTS, spaced GAP_MS apart; stops at the first successful do_query.
 * Output: evidence/mcp-probe-log.json (appended). Never writes data/ files; run data:mcp after a success.
 */
import { join } from "node:path";
import { BitgetMcp } from "../src/server/mcp";
import { ROOT, log, readJsonIfExists, sleep, writeJsonAtomic } from "./lib/fsx";

const MAX_ATTEMPTS = Number(process.env.PROBE_ATTEMPTS ?? 4);
const GAP_MS = Number(process.env.PROBE_GAP_MS ?? 90_000);

async function main() {
  const path = join(ROOT, "evidence", "mcp-probe-log.json");
  const history = readJsonIfExists<{ attempts: unknown[] }>(path) ?? { attempts: [] };
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const mcp = new BitgetMcp(20_000);
    const at = new Date().toISOString();
    try {
      await mcp.connect();
      const guide = await mcp.client_guide();
      const r = await mcp.query("equity_fundamental_dividends", { symbol: "NVDA" }, "Availability probe");
      const entry = { at, connected: true, tools: mcp.tools.map((t) => t.name), guide, doQuery: { outcome: r.outcome, statusCode: r.statusCode, error: r.error?.slice(0, 120) ?? null } };
      history.attempts.push(entry);
      log(`attempt ${i}: connected; guide ${guide}; do_query ${r.outcome} ${r.statusCode ?? ""}`);
      if (r.outcome === "OK") break;
    } catch (e) {
      history.attempts.push({ at, connected: false, error: e instanceof Error ? e.message : String(e) });
      log(`attempt ${i}: connect failed (${e instanceof Error ? e.message : e})`);
    } finally {
      await mcp.close();
    }
    writeJsonAtomic(path, history);
    if (i < MAX_ATTEMPTS) await sleep(GAP_MS);
  }
  writeJsonAtomic(path, history);
}

main();
