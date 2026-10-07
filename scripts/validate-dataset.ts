/**
 * Dataset validation (runs entirely against saved data; no network).
 * Checks bar integrity, boundary coverage, turnover usability and session-boundary evidence,
 * then decides which identity-verified instruments are supported.
 * Outputs: data/validation-report.json, data/manifest.json
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BAR_MS, fmtEt } from "../src/domain/time";
import { sessionHourlyTurnover, MIN_COMPLETE_HOURS, TURNOVER_VALID_FROM_MS } from "../src/domain/turnover";
import { observe, canonicalElapsed } from "../src/domain/episodes";
import { MIN_ELIGIBLE_EPISODES } from "../src/domain/signal";
import { datasetAvailable, episodesFor, loadDataset } from "../src/server/dataset";
import { allSessionsFor } from "../src/server/research";
import { DATA, log, sha256File, writeJsonAtomic } from "./lib/fsx";
import { median } from "../src/domain/stats";

function main() {
  if (!datasetAvailable()) throw new Error("Dataset files missing; run data:discover and data:ingest");
  const ds = loadDataset();
  const finishedAt = Date.parse(String(ds.ingest.finishedAt));
  const report: Record<string, unknown> = {};
  const supported: string[] = [];
  const unsupported: Record<string, string> = {};

  for (const inst of ds.instruments.instruments) {
    if (!inst.supported) {
      unsupported[inst.baseCoin] = inst.exclusionReason ?? "Identity not verified";
      continue;
    }
    const idx = ds.bars[inst.symbol];
    if (!idx || idx.last === null) {
      unsupported[inst.baseCoin] = "No bars ingested";
      continue;
    }
    const integrity = { offGrid: 0, unclosed: 0, invalidOhlc: 0, unsorted: 0, nullTurnover: 0, zeroTurnover: 0 };
    let prev = -Infinity;
    for (const b of idx.bars) {
      if (b.ts % BAR_MS !== 0) integrity.offGrid++;
      if (b.ts + BAR_MS > finishedAt) integrity.unclosed++;
      if (b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close) || b.low <= 0) integrity.invalidOhlc++;
      if (b.ts <= prev) integrity.unsorted++;
      if (b.quoteTurnover === null) integrity.nullTurnover++;
      else if (b.quoteTurnover === 0) integrity.zeroTurnover++;
      prev = b.ts;
    }
    // Quote-turnover unit check: turnover / baseVolume should lie within the bar's price range.
    let unitChecks = 0;
    let unitOk = 0;
    for (const b of idx.bars) {
      if (b.quoteTurnover && b.baseVolume && b.baseVolume > 0) {
        unitChecks++;
        const vwap = b.quoteTurnover / b.baseVolume;
        if (vwap >= b.low * 0.995 && vwap <= b.high * 1.005) unitOk++;
      }
    }

    const sessions = allSessionsFor(ds, inst, idx.last);
    const episodes = episodesFor(ds, inst, sessions).filter((e) => e.completedAtMs <= idx.last! + BAR_MS);
    const perWeekend = episodes.map((e) => {
      const ob = observe(e, idx, canonicalElapsed(e));
      const turnover = sessionHourlyTurnover(e.session, idx);
      const prior4 = idx.range(e.session.reopenMs - 4 * BAR_MS, e.session.reopenMs).map((b) => b.quoteTurnover ?? 0);
      const reopenBar = idx.starting(e.session.reopenMs);
      const openJump = reopenBar?.quoteTurnover && prior4.length ? reopenBar.quoteTurnover / Math.max(median(prior4), 1) : null;
      const lastWeekend = idx.range(e.session.transitionMs - 4 * BAR_MS, e.session.transitionMs).map((b) => b.quoteTurnover ?? 0);
      const switchBar = idx.starting(e.session.transitionMs);
      const switchJump = switchBar?.quoteTurnover && lastWeekend.length ? switchBar.quoteTurnover / Math.max(median(lastWeekend), 1) : null;
      return {
        key: e.key,
        start: fmtEt(e.session.startMs),
        switch: fmtEt(e.session.transitionMs),
        reopen: fmtEt(e.session.reopenMs),
        standard: e.session.standard,
        calendarStatus: e.session.calendarStatus,
        fridayBoundary: e.fridayRef !== null,
        sundayDecisionBar: ob.decisionPrice !== null,
        reopenBar: e.reopenPrice !== null,
        endpointBar: e.endpointPrice !== null,
        weekendBookMissingIntervals: idx.missingIn(e.session.startMs, e.session.transitionMs),
        weekendBookIntervals: (e.session.transitionMs - e.session.startMs) / BAR_MS,
        turnoverCompleteHours: turnover.completeHours,
        turnoverEligible: turnover.eligible,
        turnoverMedianHourlyUsdt: turnover.medianHourlyUsdt,
        reopenTurnoverJumpX: openJump !== null ? Number(openJump.toFixed(1)) : null,
        switchTurnoverJumpX: switchJump !== null ? Number(switchJump.toFixed(1)) : null,
        primaryEligible: e.baseExclusions.length === 0 && ob.decisionPrice !== null,
        boundaryComplete: e.session.standard && e.session.calendarStatus === "RECONCILED" && e.fridayRef !== null && ob.decisionPrice !== null && e.reopenPrice !== null && e.endpointPrice !== null,
        corporateAction: e.corporateAction.status,
        exclusions: [...e.baseExclusions, ...ob.exclusions],
      };
    });
    const primary = perWeekend.filter((w) => w.primaryEligible).length;
    const boundaryComplete = perWeekend.filter((w) => w.boundaryComplete).length;
    const corporateUnknown = perWeekend.filter((w) => w.corporateAction === "UNKNOWN").length;
    const turnoverOk = perWeekend.filter((w) => w.turnoverEligible).length;
    const openEvidence = perWeekend.filter((w) => w.reopenTurnoverJumpX !== null);
    report[inst.symbol] = {
      baseCoin: inst.baseCoin,
      underlying: inst.underlying,
      barsInWeekendWindows: idx.bars.length,
      firstBar: new Date(idx.first!).toISOString(),
      lastBar: new Date(idx.last).toISOString(),
      integrity,
      quoteTurnoverUnitCheck: { checked: unitChecks, vwapInsideBarRange: unitOk },
      weekends: perWeekend.length,
      primaryEligibleCanonical: primary,
      boundaryCompleteCanonical: boundaryComplete,
      corporateActionUnknownWeekends: corporateUnknown,
      turnoverEligibleSessions: turnoverOk,
      turnoverValidFrom: new Date(TURNOVER_VALID_FROM_MS).toISOString(),
      minCompleteHours: MIN_COMPLETE_HOURS,
      regularOpenEvidence: {
        weekendsChecked: openEvidence.length,
        reopenBarTurnoverAtLeast5xPrior: openEvidence.filter((w) => (w.reopenTurnoverJumpX ?? 0) >= 5).length,
      },
      perWeekend,
    };
    const reasons: string[] = [];
    if (boundaryComplete < MIN_ELIGIBLE_EPISODES + 1) reasons.push(`${boundaryComplete} weekends with complete Friday, Sunday 20:00, reopening and first-hour boundaries (need ${MIN_ELIGIBLE_EPISODES + 1} to evaluate at least one)`);
    if (turnoverOk < 3) reasons.push(`${turnoverOk} turnover-eligible weekend sessions (need 3)`);
    if (integrity.unclosed || integrity.offGrid || integrity.invalidOhlc || integrity.unsorted) reasons.push("Bar integrity failure");
    if (reasons.length) unsupported[inst.baseCoin] = reasons.join("; ");
    else supported.push(inst.symbol);
    log(`${inst.baseCoin}: weekends=${perWeekend.length} boundaryComplete=${boundaryComplete} primary=${primary} corporateUnknown=${corporateUnknown} turnoverSessions=${turnoverOk} -> ${reasons.length ? "UNSUPPORTED: " + reasons.join("; ") : "supported"}`);
  }

  writeJsonAtomic(join(DATA, "validation-report.json"), { generatedAt: new Date().toISOString(), supported, unsupported, instruments: report });
  const files = ["instruments.json", "bars.json", "anchors.json", "corporate-actions.json", "corporate-fallback.json", ...(existsSync(join(DATA, "agent-tool-receipts.json")) ? ["agent-tool-receipts.json"] : []), "tool-receipts.json", "ingest-status.json", "validation-report.json"];
  writeJsonAtomic(join(DATA, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    dataMode: "SNAPSHOT",
    pullFinishedAt: ds.ingest.finishedAt,
    sources: {
      tokenCandles: { source: "Bitget public market data v3 /api/v3/market/history-candles", category: "SPOT", type: "market", granularity: "15m", timestampSemantics: "interval start, UTC milliseconds", units: { price: "USDT per token", baseVolume: "tokens", quoteTurnover: "USDT" } },
      session: { source: "NYSE holiday calendar (nyse.com) + Bitget /api/v3/reality/market/calendar and /states", timezone: "America/New_York" },
      underlyingAnchor: { source: "Nasdaq.com historical quotes", units: "USD", note: "Official daily open/close; raw retained locally only" },
      corporateActions: { source: "Bitget AI MCP bitget-mcp-server do_query equity_fundamental_dividends / equity_calendar" },
    },
    supportedSymbols: supported,
    unsupported,
    redistribution: "Bitget and Nasdaq redistribution terms not verified; data/raw is excluded from version control and should not be published until reviewed.",
    files: Object.fromEntries(files.map((f) => [f, sha256File(join(DATA, f))])),
  });
  log(`Supported: ${supported.join(", ") || "none"}`);
}

main();
