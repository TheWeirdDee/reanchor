/**
 * Real read-only calls to Bitget's official Agent Hub MCP (local stdio, --read-only, no credentials),
 * cross-checked against the verified direct v3 dataset. One bounded run; no retry loop.
 * Output: data/agent-tool-receipts.json (separate from the data-MCP failure receipts in data/tool-receipts.json).
 */
import { join } from "node:path";
import { BitgetAgentMcp, type AgentReceipt } from "../src/server/agent-mcp";
import type { InstrumentsFile } from "../src/domain/instruments";
import { loadDataset } from "../src/server/dataset";
import { weekendSessionFor } from "../src/domain/calendar";
import { BAR_MS, fmtEt } from "../src/domain/time";
import { DATA, log, readJson, readJsonIfExists, writeJsonAtomic } from "./lib/fsx";

const SYMBOL = "RNVDAUSDT";
const WEEKEND = "2026-09-26";

type Row = [string, string, string, string, string, string, string];

function rowsFrom(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  const d = data as { list?: Row[]; candles?: Row[] } | null;
  return d?.list ?? d?.candles ?? [];
}

async function main() {
  const ds = loadDataset();
  const inst = readJson<InstrumentsFile>(join(DATA, "instruments.json")).instruments.find((i) => i.symbol === SYMBOL)!;
  const idx = ds.bars[SYMBOL];
  const session = weekendSessionFor(WEEKEND, ds.closures)!;
  const agent = new BitgetAgentMcp();
  const receipts: AgentReceipt[] = [];
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  await agent.connect();
  try {
    // 1. Instrument metadata used for precision, minimum notional and the limit-price ratio.
    const ins = await agent.market("instruments", { category: "SPOT", symbol: SYMBOL }, "Instrument precision, minimum notional and limit-price ratio for the sizing and band checks");
    receipts.push(ins.receipt);
    const list = (Array.isArray(ins.data) ? ins.data : (ins.data as { list?: unknown[] } | null)?.list ?? []) as Record<string, string>[];
    const m = list.find((x) => x.symbol === SYMBOL);
    const fields: [string, number][] = [["quantityPrecision", inst.quantityPrecision], ["pricePrecision", inst.pricePrecision], ["minOrderAmount", inst.minOrderAmount], ["minOrderQty", inst.minOrderQty], ["buyLimitPriceRatio", inst.buyLimitPriceRatio], ["sellLimitPriceRatio", inst.sellLimitPriceRatio]];
    const mism = m ? fields.filter(([k, v]) => Number(m[k]) !== v).map(([k, v]) => `${k}: agent ${m[k]} vs dataset ${v}`) : ["symbol not returned"];
    checks.push({ name: "instrument-metadata", ok: ins.receipt.outcome === "OK" && mism.length === 0, detail: mism.length ? mism.join("; ") : `isReality=${m?.isReality} symbolType=${m?.symbolType}; ${fields.length} sizing fields match` });

    // 2. Historical boundary bars for one verified weekend. history-candles returns the bars before endTime,
    //    so each bar is requested with endTime = bar start + 15m and matched by its start timestamp.
    const boundaries: [string, number, "open" | "close"][] = [
      ["Friday reference (bar ending weekend start)", session.startMs - BAR_MS, "close"],
      ["Sunday decision (bar ending transition)", session.transitionMs - BAR_MS, "close"],
      ["Reopening (bar starting 09:30 ET)", session.reopenMs, "open"],
      ["First-hour endpoint (bar ending 10:30 ET)", session.endpointMs - BAR_MS, "close"],
    ];
    for (const [label, ts, field] of boundaries) {
      const r = await agent.market("candlesHistory", { category: "SPOT", symbol: SYMBOL, interval: "15m", type: "market", endTime: String(ts + BAR_MS), limit: "3" }, `Cross-check of the ${label} for the ${WEEKEND} weekend`);
      receipts.push(r.receipt);
      const row = rowsFrom(r.data).find((x) => Number(x[0]) === ts);
      const saved = idx.starting(ts);
      const agentPx = row ? Number(field === "open" ? row[1] : row[4]) : null;
      const savedPx = saved ? (field === "open" ? saved.open : saved.close) : null;
      checks.push({ name: `boundary ${label}`, ok: r.receipt.outcome === "OK" && agentPx !== null && agentPx === savedPx, detail: `${fmtEt(ts)} ${field}: agent ${agentPx ?? "missing"} vs dataset ${savedPx ?? "missing"}` });
    }

    // 3. Recent closed candles (the live decision source).
    const recent = await agent.market("candles", { category: "SPOT", symbol: SYMBOL, interval: "15m", type: "market", limit: "8" }, "Recent closed 15m bars for the live decision price");
    receipts.push(recent.receipt);
    const rows = rowsFrom(recent.data);
    checks.push({ name: "recent-candles", ok: recent.receipt.outcome === "OK" && rows.length > 0, detail: `${rows.length} rows; latest bar start ${rows.length ? new Date(Math.max(...rows.map((x) => Number(x[0])))).toISOString() : "n/a"}` });
  } finally {
    await agent.close();
  }
  for (const c of checks) log(`${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
  // Preserve every earlier run: the previous latest run is appended to history before it is replaced.
  const prev = readJsonIfExists<{ generatedAt: string; allOk: boolean; checks: unknown[]; receipts: unknown[]; history?: unknown[] }>(join(DATA, "agent-tool-receipts.json"));
  const history = prev ? [...(prev.history ?? []), { generatedAt: prev.generatedAt, allOk: prev.allOk, checks: prev.checks, receipts: prev.receipts }] : [];
  writeJsonAtomic(join(DATA, "agent-tool-receipts.json"), {
    generatedAt: new Date().toISOString(),
    note: "Bitget Agent Hub MCP (official, read-only, no credentials). Public SPOT market operations only; this catalog has no corporate-action or underlying-stock operations.",
    allOk: checks.every((c) => c.ok),
    checks,
    receipts,
    history,
  });
  log(`Wrote data/agent-tool-receipts.json (${receipts.filter((r) => r.outcome === "OK").length}/${receipts.length} calls OK)`);
  // A run with any failed check is recorded, then reported as a failure so audit:all cannot show it as PASS.
  if (!checks.every((c) => c.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Agent MCP cross-check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
