import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CANCELLATION_RULE, CANCELLATION_SOURCE, FRESHNESS_LIMIT_MS, type Card } from "../domain/decision";
import { DEFAULT_FEE_RATE, SLIPPAGE_TIERS } from "../domain/accounting";
import { HARD_PARTICIPATION_LIMIT, HOLD_TRIM_FRACTION, MODELED_CAP, WEEKEND_BAND } from "../domain/sizing";
import { AGREEMENT_MIN, EXTREME_PERCENTILE, MIN_ELIGIBLE_EPISODES, MIN_MATCHED_EPISODES } from "../domain/signal";
import { MIN_COMPLETE_HOURS } from "../domain/turnover";
import { DEMO_CAP_USDT } from "../domain/intent";
import { CAUSE_LABEL, causesOf, type Cause } from "../domain/causes";
import { BAR_MS } from "../domain/time";
import type { ConfirmedIntention, Intent } from "../domain/intent";
import { DATA_DIR, dataVersionKey, datasetAvailable, loadDataset } from "./dataset";
import { allSessionsFor, replayCard } from "./research";
import { modelStatus } from "./model";

/**
 * Shared server-side presentation model. Every public page reads counts, statuses, dates and the real example from
 * here, so pages cannot contradict each other or the saved records. Recomputed whenever a data or evidence file changes.
 */
const ROOT = process.cwd();
const EVIDENCE_DIR = join(ROOT, "evidence");
const ARTICLE = join(EVIDENCE_DIR, "sources", "bitget-support-12560603892041.html");

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
  } catch {
    return null;
  }
}
const mtime = (p: string) => (existsSync(p) ? statSync(p).mtimeMs : 0);

export interface PricePoint {
  ts: number;
  close: number | null;
}

export interface ReplayExample {
  symbol: string;
  baseCoin: string;
  underlying: string;
  weekendKey: string;
  lastTradingDay: string;
  nextTradingDay: string;
  intention: ConfirmedIntention;
  intentionSource: string;
  action: Card["action"];
  primaryReason: string;
  causes: { code: Cause; label: string }[];
  standDownReasons: string[];
  times: { weekendStart: number; transition: number; reopen: number; endpoint: number };
  prices: { fridayRef: number | null; decision: number | null; reopen: number | null; endpoint: number | null };
  move: { w: number | null; threshold: number | null; g: number | null; r: number | null };
  sample: { eligible: number; excluded: number; matched: number; required: number };
  /** Underlying official prices (Nasdaq.com), kept separate from token prices. */
  stock: { fridayClose: number | null; fridayCloseDate: string | null; reopenOpen: number | null; reopenOpenDate: string | null; source: string | null };
  ht: number | null;
  sizing: { proposedClipUsdt: number | null; participation: number | null; capacityUsdt: number | null; modeledClipUsdt: number | null; slippageBps: number | null; reductionReasons: string[] };
  /** Median observed token-reopen vs official-open basis before this decision (scenario default). */
  basis: number | null;
  series: PricePoint[];
  pricePrecision: number;
}

export interface Presentation {
  available: boolean;
  version: string;
  snapshot: { pulledAt: string | null; evaluatedAt: string | null; manifestAt: string | null };
  coverage: {
    candidates: number;
    supported: { symbol: string; baseCoin: string; underlying: string; firstBar: string; lastBar: string; weekends: number; boundaryComplete: number; turnoverSessions: number }[];
    unsupported: { baseCoin: string; reason: string; boundaryComplete: number; turnoverSessions: number }[];
    /** First weekend with any weekend-book bar (may be a single stray trade). */
    firstWeekendWithAnyBar: string | null;
    /** First standard weekend with all four boundary prices present. */
    firstBoundaryCompleteWeekend: string | null;
    turnoverValidFrom: string | null;
  };
  validation: {
    replayRows: number;
    instruments: number;
    intents: number;
    uniqueWeekends: number;
    evaluatedWeekends: number;
    evaluatedKeys: string[];
    actionRows: number;
    standDownRows: number;
    maxMatchedInEvaluated: number;
    minMatchedRequired: number;
    headlineMinEvaluations: number;
    evaluatedCauses: { code: Cause; label: string; weekends: number }[];
    holdout: { symbol: string | null; available: boolean };
    intendedVsNoTradeDefault: { intent: string; usdt: number }[];
  };
  integrations: {
    agentHub: { status: "WORKING" | "FAILING" | "NOT_RUN"; lastRunAt: string | null; okCalls: number; calls: number; checksOk: number; checks: number; package: string | null };
    dataMcp: { status: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN"; lastCheckedAt: string | null; connected: boolean | null; catalogOk: boolean | null; outcome: string; refreshAttempts: number; summaryOnlyRefreshes: number };
    corporateActions: { source: "BITGET_AI_MCP" | "FALLBACK" | "UNAVAILABLE"; label: string; retrievedAt: string | null };
    earnings: { available: boolean; note: string };
    underlying: { source: string | null; retrievedAt: string | null };
    model: { configured: boolean; provider: string; model: string; verification: string | null; checkedAt: string | null; realCallOk: boolean | null };
  };
  session: { daylightTypeReported: string | null; reportedAt: string | null; reopenCheck: string | null };
  cancellation: { rule: string; source: string; scopeUnderlyings: string[]; timing: "NOT_VERIFIED" };
  example: ReplayExample | null;
  /** Engine constants, read from code so copy never restates them by hand. */
  assumptions: {
    feeRate: number;
    slippageTiers: { maxParticipation: number; bps: number }[];
    freshnessMinutes: number;
    minCompleteHours: number;
    agreementMin: number;
    hardParticipation: number;
    modeledCap: number;
    holdTrimFraction: number;
    weekendBand: number;
    extremePercentile: number;
    minEligible: number;
    minMatched: number;
    demoCapUsdt: number;
  };
}

let memo: { key: string; value: Presentation } | null = null;

function evidenceKey(): string {
  return [
    dataVersionKey(),
    mtime(join(DATA_DIR, "evaluations.json")),
    mtime(join(DATA_DIR, "weekends.json")),
    mtime(join(DATA_DIR, "validation-report.json")),
    mtime(join(DATA_DIR, "agent-tool-receipts.json")),
    mtime(join(DATA_DIR, "tool-receipts.json")),
    mtime(join(EVIDENCE_DIR, "mcp-probe-log.json")),
    mtime(join(EVIDENCE_DIR, "model-check.json")),
    mtime(ARTICLE),
  ].join("|");
}

export function getPresentation(): Presentation {
  const key = evidenceKey();
  if (memo && memo.key === key) return memo.value;
  const value = build(key);
  memo = { key, value };
  return value;
}

interface EvalRow {
  key: string;
  evaluable: boolean;
  action: string;
  matched: number;
  extreme: boolean;
  standDownReasons: string[];
}
interface EvaluationsFile {
  generatedAt: string;
  referenceInputs: Record<Intent, { holdingUsdt: number | null; tradeUsdt: number | null }>;
  holdoutSymbol: string;
  headlineMinEvaluations: number;
  evaluations: Record<string, { baseCoin: string; intents: Record<string, { rows: EvalRow[]; wealthDifferenceUsdt: Record<string, { intendedVsNoTrade: number }> }> }>;
}
interface ValidationFile {
  supported: string[];
  unsupported: Record<string, string>;
  instruments: Record<string, { baseCoin: string; underlying: string; weekends: number; boundaryCompleteCanonical: number; turnoverEligibleSessions: number; firstBar: string; lastBar: string; turnoverValidFrom: string; regularOpenEvidence: { weekendsChecked: number; reopenBarTurnoverAtLeast5xPrior: number }; perWeekend: { key: string; weekendBookMissingIntervals: number; weekendBookIntervals: number; boundaryComplete?: boolean }[] }>;
}

function build(version: string): Presentation {
  const evals = readJson<EvaluationsFile>(join(DATA_DIR, "evaluations.json"));
  const val = readJson<ValidationFile>(join(DATA_DIR, "validation-report.json"));
  const ingest = readJson<{ finishedAt: string }>(join(DATA_DIR, "ingest-status.json"));
  const manifest = readJson<{ generatedAt: string }>(join(DATA_DIR, "manifest.json"));
  const agent = readJson<{ generatedAt: string; allOk: boolean; checks: { ok: boolean }[]; receipts: { outcome: string; server?: { package?: string } }[] }>(join(DATA_DIR, "agent-tool-receipts.json"));
  const toolReceipts = readJson<{ attempts?: unknown[]; receipts?: { statusCode: number | null; outcome: string }[]; receiptHistory?: unknown[]; failedRunReceipts?: unknown[] }>(join(DATA_DIR, "tool-receipts.json"));
  const probe = readJson<{ attempts: { at: string; connected: boolean; guide?: string; doQuery?: { outcome: string; statusCode: number | null; error?: string | null }; error?: string }[] }>(join(EVIDENCE_DIR, "mcp-probe-log.json"));
  const modelCheck = readJson<{ checkedAt: string; provider: string; model: string; verification: { status: string }; realCall: { ok: boolean } | null }>(join(EVIDENCE_DIR, "model-check.json"));
  const fallback = readJson<{ source: string; retrievedAt: string }>(join(DATA_DIR, "corporate-fallback.json"));
  const instrumentsFile = readJson<{ discoveredAt: string; marketStates?: { daylightType?: string } }>(join(DATA_DIR, "instruments.json"));
  const anchors = readJson<{ source: string; retrievedAt: string }>(join(DATA_DIR, "anchors.json"));
  const ds = datasetAvailable() ? loadDataset() : null;

  // Coverage
  const supported = val
    ? val.supported.map((s) => {
        const x = val.instruments[s];
        return { symbol: s, baseCoin: x.baseCoin, underlying: x.underlying, firstBar: x.firstBar, lastBar: x.lastBar, weekends: x.weekends, boundaryComplete: x.boundaryCompleteCanonical, turnoverSessions: x.turnoverEligibleSessions };
      })
    : [];
  const unsupported = val
    ? Object.values(val.instruments)
        .filter((x) => !supported.some((s) => s.baseCoin === x.baseCoin))
        .map((x) => ({ baseCoin: x.baseCoin, reason: val.unsupported[x.baseCoin] ?? "Not supported", boundaryComplete: x.boundaryCompleteCanonical, turnoverSessions: x.turnoverEligibleSessions }))
    : [];
  const firstSupported = supported[0] ? val!.instruments[supported[0].symbol] : null;
  const firstWeekendWithTrading = firstSupported?.perWeekend.find((w) => w.weekendBookMissingIntervals < w.weekendBookIntervals)?.key ?? null;

  // Validation
  const allRows: (EvalRow & { symbol: string; intent: string })[] = [];
  for (const [symbol, e] of Object.entries(evals?.evaluations ?? {})) for (const [intent, v] of Object.entries(e.intents)) for (const r of v.rows) allRows.push({ ...r, symbol, intent });
  const evaluatedRows = allRows.filter((r) => r.evaluable);
  const evaluatedKeys = [...new Set(evaluatedRows.map((r) => `${r.symbol}:${r.key}`))].sort();
  const causeWeekends = new Map<Cause, Set<string>>();
  for (const r of evaluatedRows) for (const c of causesOf(r.standDownReasons)) (causeWeekends.get(c) ?? causeWeekends.set(c, new Set()).get(c)!).add(`${r.symbol}:${r.key}`);
  const intendedVsNoTradeDefault = Object.values(evals?.evaluations ?? {}).flatMap((e) => Object.entries(e.intents).map(([intent, v]) => ({ intent, usdt: v.wealthDifferenceUsdt.DEFAULT?.intendedVsNoTrade ?? 0 })));

  // Integrations
  const agentOk = agent?.receipts.filter((r) => r.outcome === "OK").length ?? 0;
  const lastProbe = probe?.attempts.at(-1) ?? null;
  const lastStatus = lastProbe?.doQuery?.statusCode ?? toolReceipts?.receipts?.find((r) => r.outcome !== "OK")?.statusCode ?? null;
  const dataMcpOk = lastProbe?.doQuery?.outcome === "OK";
  const dataMcpOutcome = !lastProbe
    ? "Not probed"
    : !lastProbe.connected
      ? `Connection failed${lastProbe.error ? ` (${lastProbe.error.slice(0, 60)})` : ""}`
      : dataMcpOk
        ? "Research queries succeeded"
        : `Research queries failed${lastStatus ? ` with HTTP ${lastStatus}` : ""}; catalog call ${lastProbe.guide?.startsWith("OK") ? "succeeded" : "failed"}`;
  const attempts = toolReceipts?.attempts?.length ?? 0;
  const keptRuns = (toolReceipts?.receipts ? 1 : 0) + (toolReceipts?.receiptHistory?.length ?? 0) + (toolReceipts?.failedRunReceipts?.length ?? 0);
  const corporateOk = ds ? Object.values(ds.corporate.byUnderlying).every((c) => c.status === "OK") : false;

  // Cancellation scope: which supported underlyings the saved Bitget article names as weekend-tradable.
  const articleText = existsSync(ARTICLE) ? readFileSync(ARTICLE, "utf8").replace(/<[^>]+>/g, " ") : "";
  const scopeUnderlyings = supported.map((s) => s.underlying).filter((u) => new RegExp(`\\b${u}\\b`).test(articleText));

  const ms = modelStatus();
  const example = ds && evals ? buildExample(evals, ds) : null;
  const reopenEvidence = firstSupported ? `${firstSupported.regularOpenEvidence.reopenBarTurnoverAtLeast5xPrior}/${firstSupported.regularOpenEvidence.weekendsChecked}` : null;

  return {
    available: !!(ds && evals && val),
    version,
    snapshot: { pulledAt: ingest?.finishedAt ?? null, evaluatedAt: evals?.generatedAt ?? null, manifestAt: manifest?.generatedAt ?? null },
    coverage: {
      candidates: val ? Object.keys(val.instruments).length : 0,
      supported,
      unsupported,
      firstWeekendWithAnyBar: firstWeekendWithTrading,
      firstBoundaryCompleteWeekend: firstSupported?.perWeekend.find((w) => w.boundaryComplete)?.key ?? null,
      turnoverValidFrom: firstSupported?.turnoverValidFrom ?? null,
    },
    validation: {
      replayRows: allRows.length,
      instruments: Object.keys(evals?.evaluations ?? {}).length,
      intents: new Set(allRows.map((r) => r.intent)).size,
      uniqueWeekends: new Set(allRows.map((r) => `${r.symbol}:${r.key}`)).size,
      evaluatedWeekends: evaluatedKeys.length,
      evaluatedKeys,
      actionRows: allRows.filter((r) => r.action !== "STAND_DOWN").length,
      standDownRows: allRows.filter((r) => r.action === "STAND_DOWN").length,
      maxMatchedInEvaluated: evaluatedRows.reduce((m, r) => Math.max(m, r.matched), 0),
      minMatchedRequired: MIN_MATCHED_EPISODES,
      headlineMinEvaluations: evals?.headlineMinEvaluations ?? 8,
      evaluatedCauses: [...causeWeekends.entries()].map(([code, set]) => ({ code, label: CAUSE_LABEL[code], weekends: set.size })).sort((a, b) => b.weekends - a.weekends),
      holdout: { symbol: evals?.holdoutSymbol ?? null, available: !!evals && supported.some((s) => s.symbol === evals.holdoutSymbol) },
      intendedVsNoTradeDefault,
    },
    integrations: {
      agentHub: {
        status: !agent ? "NOT_RUN" : agent.allOk ? "WORKING" : "FAILING",
        lastRunAt: agent?.generatedAt ?? null,
        okCalls: agentOk,
        calls: agent?.receipts.length ?? 0,
        checksOk: agent?.checks.filter((c) => c.ok).length ?? 0,
        checks: agent?.checks.length ?? 0,
        package: agent?.receipts[0]?.server?.package ?? null,
      },
      dataMcp: {
        status: !lastProbe ? "UNKNOWN" : dataMcpOk ? "AVAILABLE" : "UNAVAILABLE",
        lastCheckedAt: lastProbe?.at ?? null,
        connected: lastProbe?.connected ?? null,
        catalogOk: lastProbe ? !!lastProbe.guide?.startsWith("OK") : null,
        outcome: dataMcpOutcome,
        refreshAttempts: attempts,
        summaryOnlyRefreshes: Math.max(0, attempts - keptRuns),
      },
      corporateActions: corporateOk
        ? { source: "BITGET_AI_MCP", label: "Bitget AI data MCP", retrievedAt: ds?.corporate.retrievedAt ?? null }
        : fallback
          ? { source: "FALLBACK", label: "Bitget split records plus Nasdaq.com dividend history (labeled fallback)", retrievedAt: fallback.retrievedAt }
          : { source: "UNAVAILABLE", label: "Unavailable", retrievedAt: null },
      earnings: corporateOk ? { available: true, note: "From the Bitget AI data MCP earnings calendar" } : { available: false, note: "Unavailable while the Bitget AI data MCP research queries fail" },
      underlying: { source: anchors?.source ?? null, retrievedAt: anchors?.retrievedAt ?? null },
      model: {
        configured: ms.available,
        provider: ms.provider,
        model: ms.model,
        verification: modelCheck?.model === ms.model ? modelCheck.verification.status : null,
        checkedAt: modelCheck?.model === ms.model ? modelCheck.checkedAt : null,
        realCallOk: modelCheck?.model === ms.model ? (modelCheck.realCall?.ok ?? null) : null,
      },
    },
    session: { daylightTypeReported: instrumentsFile?.marketStates?.daylightType ?? null, reportedAt: instrumentsFile?.discoveredAt ?? null, reopenCheck: reopenEvidence },
    cancellation: { rule: CANCELLATION_RULE, source: CANCELLATION_SOURCE, scopeUnderlyings, timing: "NOT_VERIFIED" },
    example,
    assumptions: {
      feeRate: DEFAULT_FEE_RATE,
      slippageTiers: SLIPPAGE_TIERS.map((t) => ({ ...t })),
      freshnessMinutes: FRESHNESS_LIMIT_MS / 60_000,
      minCompleteHours: MIN_COMPLETE_HOURS,
      agreementMin: AGREEMENT_MIN,
      hardParticipation: HARD_PARTICIPATION_LIMIT,
      modeledCap: MODELED_CAP,
      holdTrimFraction: HOLD_TRIM_FRACTION,
      weekendBand: WEEKEND_BAND,
      extremePercentile: EXTREME_PERCENTILE,
      minEligible: MIN_ELIGIBLE_EPISODES,
      minMatched: MIN_MATCHED_EPISODES,
      demoCapUsdt: DEMO_CAP_USDT,
    },
  };
}

/** The most recent evaluated weekend of the first supported instrument, replayed with the predeclared HOLD reference input. */
function buildExample(evals: EvaluationsFile, ds: ReturnType<typeof loadDataset>): ReplayExample | null {
  const inst = ds.supported[0];
  if (!inst) return null;
  const rows = evals.evaluations[inst.symbol]?.intents.HOLD?.rows ?? [];
  const latest = [...rows].reverse().find((r) => r.evaluable);
  if (!latest) return null;
  const ref = evals.referenceInputs.HOLD;
  const intention: ConfirmedIntention = { symbol: inst.symbol, intent: "HOLD", holdingUsdt: ref.holdingUsdt, tradeUsdt: ref.tradeUsdt, limitPrice: null };
  const { card, basis } = replayCard(ds, intention, latest.key);
  const idx = ds.bars[inst.symbol];
  const session = allSessionsFor(ds, inst, idx.last ?? 0).find((s) => s.key === latest.key);
  if (!session) return null;
  const series: PricePoint[] = [];
  for (let t = session.startMs - BAR_MS; t < session.endpointMs; t += BAR_MS) series.push({ ts: t + BAR_MS, close: idx.starting(t)?.close ?? null });
  const causes = causesOf(card.standDownReasons).map((code) => ({ code, label: CAUSE_LABEL[code] }));
  return {
    symbol: inst.symbol,
    baseCoin: inst.baseCoin,
    underlying: inst.underlying,
    weekendKey: latest.key,
    lastTradingDay: session.lastTradingDay,
    nextTradingDay: session.nextTradingDay,
    intention,
    intentionSource: "Predeclared reference input used in the chronological evaluation",
    action: card.action,
    primaryReason: card.standDownReasons[0] ?? (card.action === "STAND_DOWN" ? "No proposed trade" : `${card.action} ${card.side ?? ""}`.trim()),
    causes,
    standDownReasons: card.standDownReasons,
    times: { weekendStart: session.startMs, transition: session.transitionMs, reopen: session.reopenMs, endpoint: session.endpointMs },
    prices: { fridayRef: card.observation.fridayRef, decision: card.observation.decisionPrice, reopen: card.realized?.reopenPrice ?? null, endpoint: card.realized?.endpointPrice ?? null },
    move: { w: card.observation.w, threshold: card.signal.threshold, g: card.realized?.g ?? null, r: card.realized?.r ?? null },
    sample: { eligible: card.signal.eligibleCount, excluded: card.signal.excludedCount, matched: card.signal.matchedCount, required: MIN_MATCHED_EPISODES },
    stock: {
      fridayClose: card.underlying?.fridayClose ?? null,
      fridayCloseDate: card.underlying?.fridayCloseDate ?? null,
      reopenOpen: card.underlying?.reopenOpen ?? null,
      reopenOpenDate: card.underlying?.reopenOpenDate ?? null,
      source: card.underlying?.source ?? null,
    },
    ht: card.ht.value,
    sizing: {
      proposedClipUsdt: card.sizing.proposedClipUsdt,
      participation: card.sizing.proposedParticipation,
      capacityUsdt: card.sizing.capacityUsdt,
      modeledClipUsdt: card.action === "STAND_DOWN" ? null : card.sizing.modeledClipUsdt,
      slippageBps: card.slippageBps,
      reductionReasons: card.sizing.reductionReasons,
    },
    basis,
    series,
    pricePrecision: inst.pricePrecision,
  };
}
