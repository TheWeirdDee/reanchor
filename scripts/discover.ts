/**
 * Instrument discovery (calls Bitget public endpoints).
 * Verifies Reality/rToken identity from documented metadata and preserves exact symbols.
 * Output: data/instruments.json, data/raw/discovery/*.json
 */
import { join } from "node:path";
import { CANDIDATE_BASE_COINS, type InstrumentsFile, type VerifiedInstrument } from "../src/domain/instruments";
import { calendarClosures, getInstruments, getMarketCalendar, getMarketStates, getStockInfo } from "../src/server/bitget";
import { DATA, RAW, log, pacer, writeJsonAtomic } from "./lib/fsx";

const ETF_UNDERLYINGS = new Set(["QQQ"]);

async function main() {
  const pace = pacer(0.8); // Reality endpoints: 1 request/second/IP
  const receipts: unknown[] = [];
  const instr = await getInstruments();
  receipts.push(instr.receipt);
  writeJsonAtomic(join(RAW, "discovery", "instruments-spot.json"), instr.raw, false);
  log(`SPOT instruments returned: ${instr.data.length}`);

  await pace();
  const states = await getMarketStates();
  receipts.push(states.receipt);
  writeJsonAtomic(join(RAW, "discovery", "reality-market-states.json"), states.raw);
  await pace();
  const cal = await getMarketCalendar();
  receipts.push(cal.receipt);
  writeJsonAtomic(join(RAW, "discovery", "reality-market-calendar.json"), cal.raw);

  const out: VerifiedInstrument[] = [];
  for (const base of CANDIDATE_BASE_COINS) {
    const matches = instr.data.filter((i) => i.baseCoin === base && i.quoteCoin === "USDT");
    const evidence: string[] = [];
    if (matches.length !== 1) {
      out.push(blank(base, `Expected exactly one ${base}/USDT SPOT instrument, found ${matches.length}`));
      continue;
    }
    const m = matches[0];
    evidence.push(`instruments: symbol=${m.symbol} baseCoin=${m.baseCoin} category=${m.category} symbolType=${m.symbolType} isReality=${m.isReality} status=${m.status}`);
    await pace();
    const si = await getStockInfo(m.symbol);
    receipts.push(si.receipt);
    writeJsonAtomic(join(RAW, "discovery", `stock-info-${m.symbol}.json`), si.raw);
    const info = si.data.find((d) => d.symbol === m.symbol);
    if (info) evidence.push(`reality stock-info: code=${info.code} weekendTradable=${info.weekendTradable} tradingPeriod=${info.tradingPeriod.join(",")}`);

    let reason: string | null = null;
    if (m.category !== "SPOT") reason = "Not a SPOT instrument";
    else if (m.isReality !== "yes") reason = "isReality is not 'yes'";
    else if (m.symbolType !== "stock") reason = "symbolType is not 'stock'";
    else if (m.status !== "online") reason = `status is ${m.status}`;
    else if (!info) reason = "Reality stock-info did not return this symbol";
    else if (info.weekendTradable !== "yes") reason = "Not weekend tradable";
    else if (`r${info.code}` !== m.baseCoin) reason = `Underlying code ${info.code} does not match base coin ${m.baseCoin}`;

    out.push({
      symbol: m.symbol,
      baseCoin: m.baseCoin,
      quoteCoin: m.quoteCoin,
      underlying: info?.code ?? "",
      underlyingAssetClass: info && ETF_UNDERLYINGS.has(info.code) ? "etf" : "stocks",
      pricePrecision: Number(m.pricePrecision),
      quantityPrecision: Number(m.quantityPrecision),
      minOrderQty: Number(m.minOrderQty),
      minOrderAmount: Number(m.minOrderAmount),
      buyLimitPriceRatio: Number(m.buyLimitPriceRatio),
      sellLimitPriceRatio: Number(m.sellLimitPriceRatio),
      launchTimeMs: m.launchTime ? Number(m.launchTime) : null,
      weekendTradable: info?.weekendTradable === "yes",
      tradingPeriod: info?.tradingPeriod ?? [],
      identityEvidence: evidence,
      supported: reason === null, // provisional; ingest/validation may still exclude for data coverage
      exclusionReason: reason,
    });
    log(`${base}: ${reason ?? "identity verified"} (${m.symbol})`);
  }

  const file: InstrumentsFile = {
    discoveredAt: new Date().toISOString(),
    instruments: out,
    marketStates: states.data,
    marketCalendar: { timeZone: cal.data.timeZone, closures: calendarClosures(cal.data), regularConfig: cal.data.regularConfig },
    receipts,
  };
  writeJsonAtomic(join(DATA, "instruments.json"), file);
  log(`Wrote data/instruments.json (${out.filter((o) => o.supported).length}/${out.length} identity-verified)`);
}

function blank(base: string, reason: string): VerifiedInstrument {
  return {
    symbol: "", baseCoin: base, quoteCoin: "USDT", underlying: "", underlyingAssetClass: "stocks",
    pricePrecision: 0, quantityPrecision: 0, minOrderQty: 0, minOrderAmount: 0, buyLimitPriceRatio: 0, sellLimitPriceRatio: 0,
    launchTimeMs: null, weekendTradable: false, tradingPeriod: [], identityEvidence: [], supported: false, exclusionReason: reason,
  };
}

main().catch((e) => {
  console.error("Discovery failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
