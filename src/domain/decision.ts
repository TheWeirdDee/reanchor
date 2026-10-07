import type { Bar, BarIndex } from "./candles";
import type { WeekendSession, SessionPhase } from "./calendar";
import { canonicalElapsed, observe, type CorporateActionCheck, type Episode, type UnderlyingAnchor } from "./episodes";
import type { ConfirmedIntention, Intent } from "./intent";
import type { VerifiedInstrument } from "./instruments";
import { computeHt, type HtResult } from "./turnover";
import { evaluateSignal, MIN_ELIGIBLE_EPISODES, MIN_MATCHED_EPISODES, type SignalResult } from "./signal";
import { checkBand, HARD_PARTICIPATION_LIMIT, sizeClip, type BandCheck, type Sizing } from "./sizing";
import { compare, COST_CASES, slippageBpsFor, type Comparison, type CostCase } from "./accounting";
import { BAR_MS, MIN } from "./time";
import { median } from "./stats";

/** Bitget support article 12560603892041, FAQ 13 (verbatim). It carries no timestamp. */
export const CANCELLATION_RULE = "Unfilled limit orders placed during the weekend will be automatically canceled when the system switches back to regular trading on Monday's US stock market open.";
export const CANCELLATION_SOURCE = "Bitget support article 12560603892041 (published 2026-08-14), FAQ 13; saved copy evidence/sources/bitget-support-12560603892041.html, retrieved 2026-10-06";

export const FRESHNESS_LIMIT_MS = 45 * MIN;
export const ENGINE_VERSION = "reanchor-engine/1.0.0";

export type Action = "TRIM" | "FADE" | "STAND_DOWN";
export type Side = "BUY" | "SELL" | null;
export type DataMode = "LIVE" | "REPLAY";

export interface SessionVerification {
  verified: boolean;
  notes: string[];
}

export interface ResearchContext {
  instrument: VerifiedInstrument;
  intention: ConfirmedIntention;
  mode: DataMode;
  /** Decision instant. LIVE: request time. REPLAY: the historical canonical decision time. */
  t: number;
  phase: SessionPhase;
  session: WeekendSession | null;
  sessionVerification: SessionVerification;
  index: BarIndex;
  allSessions: WeekendSession[];
  episodes: Episode[];
  corporateAction: CorporateActionCheck;
  underlying: UnderlyingAnchor | null;
  dataRetrievedAt: string;
  context: { earningsNote: string | null };
  /**
   * Sensitivity overrides for audit runs only. Canonical results always use the defaults
   * (MIN_COMPLETE_HOURS = 6, AGREEMENT_MIN = 2/3). agreementMin = 0 disables the conflict rule.
   */
  options?: { minCompleteHours?: number; agreementMin?: number };
}

export interface HistoryRow {
  key: string;
  status: "MATCHED" | "ELIGIBLE" | "EXCLUDED";
  decisionMs: number | null;
  decisionPrice: number | null;
  reopenPrice: number | null;
  endpointPrice: number | null;
  w: number | null;
  g: number | null;
  r: number | null;
  priorEligibleCount: number | null;
  /** Default-cost comparison for this row; null when excluded. */
  comparison: Comparison | null;
  reasons: string[];
  fallback: { price: number; barEndMs: number } | null;
}

export interface BaselineSummary {
  costCase: CostCase;
  rows: number;
  /** Sum over rows of intended minus no-trade wealth (quote-based). */
  intendedVsNoTradeSum: number;
  modeledVsNoTradeSum: number;
  modeledVsIntendedSum: number | null;
  intendedWorseThanNoTrade: number;
}

export interface Card {
  engine: string;
  mode: DataMode;
  t: number;
  dataRetrievedAt: string;
  instrument: { symbol: string; baseCoin: string; underlying: string; pricePrecision: number; quantityPrecision: number; minOrderQty: number; minOrderAmount: number };
  intention: ConfirmedIntention;
  session: {
    phase: SessionPhase;
    key: string | null;
    startMs: number | null;
    transitionMs: number | null;
    reopenMs: number | null;
    endpointMs: number | null;
    calendarStatus: string;
    verified: boolean;
    notes: string[];
  };
  observation: {
    fridayRef: number | null;
    fridayRefBarEndMs: number | null;
    decisionPrice: number | null;
    decisionBarEndMs: number | null;
    ageMinutes: number | null;
    fresh: boolean;
    w: number | null;
    elapsedMs: number | null;
    cohortKind: "CANONICAL" | "MATCHED" | null;
    fallback: { price: number; barEndMs: number } | null;
  };
  underlying: UnderlyingAnchor | null;
  corporateAction: CorporateActionCheck;
  ht: HtResult;
  signal: Omit<SignalResult, "eligible" | "excluded"> & { eligibleCount: number; excludedCount: number };
  action: Action;
  side: Side;
  hardFailures: string[];
  standDownReasons: string[];
  sizing: Sizing;
  band: BandCheck;
  slippageBps: number | null;
  /** Cancellation of unfilled weekend limits: the documented rule only. No timestamp is attached because none is verified. */
  cancellation: { status: "UNVERIFIED"; rule: string; source: string; explanation: string };
  history: HistoryRow[];
  baseline: BaselineSummary[];
  realized: { r: number | null; g: number | null; endpointPrice: number | null; reopenPrice: number | null; comparisons: Comparison[] } | null;
  limitations: string[];
  context: { earningsNote: string | null };
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

function intendedSide(intent: Intent): Side {
  return intent === "BUY_DIP" ? "BUY" : "SELL";
}

export function computeCard(ctx: ResearchContext): Card {
  const { instrument: inst, intention: x, session, index, t } = ctx;
  const hard: string[] = [];

  // Session gates.
  if (ctx.phase !== "WEEKEND_BOOK" || !session) hard.push("Not inside a verified weekend session");
  if (session && session.calendarStatus !== "RECONCILED") hard.push(`Bitget closure calendar not reconciled with the NYSE calendar: ${session.calendarNotes.join("; ")}`);
  if (session && !session.standard) hard.push(`Nonstandard weekend (holiday or early close): ${session.nonstandardReasons.join("; ")}. Reopening comparisons are verified only for standard Friday-to-Monday weekends`);
  if (!ctx.sessionVerification.verified) hard.push(`Session clock not verified: ${ctx.sessionVerification.notes.join("; ")}`);

  // Observation.
  let fridayBar: Bar | undefined;
  let decisionBar: Bar | undefined;
  let fallback: { price: number; barEndMs: number } | null = null;
  if (session) {
    fridayBar = index.endingAt(session.startMs);
    if (ctx.mode === "REPLAY") {
      decisionBar = index.endingAt(t);
      if (!decisionBar) {
        const fb = index.latestEndingBy(t, t - session.startMs);
        if (fb && fb.ts >= session.startMs) fallback = { price: fb.close, barEndMs: fb.ts + BAR_MS };
      }
    } else {
      const latest = index.latestEndingBy(Math.min(t, session.transitionMs), Math.max(0, Math.min(t, session.transitionMs) - session.startMs));
      if (latest && latest.ts >= session.startMs) decisionBar = latest;
    }
  }
  const decisionBarEndMs = decisionBar ? decisionBar.ts + BAR_MS : null;
  const decisionPrice = decisionBar?.close ?? null;
  const fridayRef = fridayBar?.close ?? null;
  const ageMs = decisionBarEndMs !== null ? t - decisionBarEndMs : null;
  const fresh = ageMs !== null && ageMs <= FRESHNESS_LIMIT_MS;
  const w = decisionPrice !== null && fridayRef !== null ? decisionPrice / fridayRef - 1 : null;
  const elapsedMs = session && decisionBarEndMs !== null ? Math.floor((decisionBarEndMs - session.startMs) / BAR_MS) * BAR_MS : null;
  const canonical = session ? session.canonicalDecisionMs - session.startMs : null;
  const cohortKind = elapsedMs === null ? null : elapsedMs === canonical ? "CANONICAL" : "MATCHED";

  if (session && fridayRef === null) hard.push("Missing the 15m bar ending at the weekend start (Friday reference)");
  if (session && decisionPrice === null) hard.push(ctx.mode === "REPLAY" ? "Missing the 15m bar ending exactly at the decision time" : "No closed 15m weekend bar available yet");
  if (decisionPrice !== null && !fresh) hard.push(`Decision price is ${Math.round((ageMs as number) / MIN)} minutes old (limit 45)`);
  if (ctx.corporateAction.status !== "CLEAR") hard.push(`Corporate-action status ${ctx.corporateAction.status.toLowerCase()}: ${ctx.corporateAction.detail}`);

  // Historical evidence (strictly before t).
  const ht = computeHt(t, ctx.allSessions, index, ctx.options?.minCompleteHours);
  if (ht.value === null) hard.push(`Hourly turnover denominator H_t unavailable: ${ht.reason}`);
  const signal = evaluateSignal(t, w, cohortKind === "MATCHED" && elapsedMs !== null ? elapsedMs : "CANONICAL", ctx.episodes, index, ctx.options?.agreementMin);
  if (signal.eligible.length < MIN_ELIGIBLE_EPISODES) hard.push(`Only ${signal.eligible.length} eligible prior episodes (minimum ${MIN_ELIGIBLE_EPISODES})`);

  // Intent-specific hard failures.
  const needsLimit = x.intent !== "HOLD";
  if (needsLimit && x.limitPrice === null) hard.push("A proposed limit price is required for this intent");
  if (x.intent === "SELL_POP" && (x.holdingUsdt === null || x.tradeUsdt === null || x.tradeUsdt > x.holdingUsdt)) hard.push("Insufficient stated holdings for the proposed sale");
  if (x.intent === "HOLD" && x.holdingUsdt === null) hard.push("Holding value is required");

  const band = checkBand({
    intent: x.intent,
    limitPrice: x.limitPrice,
    sessionReference: fridayRef,
    latestTokenPrice: decisionPrice,
    buyRatio: inst.buyLimitPriceRatio,
    sellRatio: inst.sellLimitPriceRatio,
  });
  if (needsLimit && x.limitPrice !== null && band.status === "OUTSIDE") hard.push("Proposed limit is outside the approximate placement band");
  if (needsLimit && x.limitPrice !== null && band.status === "UNKNOWN") hard.push("Placement band could not be verified");

  const pricingReference = x.intent === "HOLD" ? decisionPrice : x.limitPrice;
  const sizing = sizeClip({
    intent: x.intent,
    holdingUsdt: x.holdingUsdt,
    tradeUsdt: x.tradeUsdt,
    ht: ht.value,
    pricingReference,
    precision: { quantityDecimals: inst.quantityPrecision, minOrderQty: inst.minOrderQty, minOrderAmount: inst.minOrderAmount },
  });
  if (sizing.proposedParticipation !== null && sizing.proposedParticipation > HARD_PARTICIPATION_LIMIT) {
    hard.push(`Proposed clip is ${pct(sizing.proposedParticipation)} of H_t (hard limit 25%)`);
  }

  // Directional evidence and deterministic intent mapping.
  const standDown: string[] = [];
  let action: Action = "STAND_DOWN";
  if (hard.length === 0) {
    if (!signal.extreme) standDown.push(`Weekend move ${w !== null ? pct(w) : "n/a"} is not beyond the historical 70th-percentile threshold ${signal.threshold !== null ? pct(signal.threshold) : "n/a"}`);
    else if (signal.matchedCount < MIN_MATCHED_EPISODES) standDown.push(`Only ${signal.matchedCount} matched same-direction extreme episodes (minimum ${MIN_MATCHED_EPISODES})`);
    else if (signal.signal !== "REVERSAL") standDown.push(`Matched episodes show ${signal.signal.toLowerCase()}, not reversal`);
    else {
      const up = (w as number) > 0;
      if (x.intent === "HOLD") {
        if (up) action = "TRIM";
        else standDown.push("Reversal after a downward move does not map to a trim of a held position");
      } else if (x.intent === "BUY_DIP") {
        if (!up) action = "FADE";
        else standDown.push("Buy-the-dip requires an extreme downward weekend move");
      } else {
        if (up) action = "FADE";
        else standDown.push("Sell-into-a-pop requires an extreme upward weekend move");
      }
    }
    if (action !== "STAND_DOWN" && sizing.modeledClipUsdt === null) {
      standDown.push(...sizing.failures);
      action = "STAND_DOWN";
    }
  }
  const side: Side = action === "STAND_DOWN" ? null : action === "TRIM" ? "SELL" : intendedSide(x.intent);
  const slip = sizing.modeledParticipation !== null ? slippageBpsFor(sizing.modeledParticipation) : sizing.capacityUsdt !== null && ht.value ? slippageBpsFor(sizing.capacityUsdt / ht.value) : null;

  // Historical stress-test rows: the user's intention replayed on each eligible prior weekend.
  const intendedUsdt = sizing.proposedClipUsdt;
  const modeledUsdt = action === "STAND_DOWN" ? 0 : (sizing.modeledClipUsdt ?? 0);
  const intendedExecutable = sizing.proposedParticipation !== null && sizing.proposedParticipation <= 0.1;
  const slipForRows = slip ?? 15;
  const initialFor = (intent: Intent) => (intent === "BUY_DIP" ? (x.tradeUsdt ?? 0) : (x.holdingUsdt ?? 0));
  const rows: HistoryRow[] = [];
  signal.eligible.forEach((e, i) => {
    const comparison =
      intendedUsdt !== null && initialFor(x.intent) > 0
        ? compare({
            intent: x.intent,
            decisionPrice: e.decisionPrice,
            endpointPrice: e.endpointPrice,
            initial: initialFor(x.intent),
            intendedUsdt,
            modeledUsdt,
            quantityDecimals: inst.quantityPrecision,
            slipBps: slipForRows,
            intendedExecutable,
            costCase: "DEFAULT",
          })
        : null;
    rows.push({
      key: e.key,
      status: e.matched ? "MATCHED" : "ELIGIBLE",
      decisionMs: e.decisionMs,
      decisionPrice: e.decisionPrice,
      reopenPrice: e.reopenPrice,
      endpointPrice: e.endpointPrice,
      w: e.w,
      g: e.g,
      r: e.r,
      priorEligibleCount: i,
      comparison,
      reasons: [],
      fallback: null,
    });
  });
  for (const ex of signal.excluded) {
    rows.push({
      key: ex.key, status: "EXCLUDED", decisionMs: null, decisionPrice: null, reopenPrice: null, endpointPrice: null,
      w: null, g: null, r: null, priorEligibleCount: null, comparison: null, reasons: ex.reasons,
      fallback: ex.fallbackPrice !== null && ex.fallbackBarEndMs !== null ? { price: ex.fallbackPrice, barEndMs: ex.fallbackBarEndMs } : null,
    });
  }
  rows.sort((a, b) => b.key.localeCompare(a.key));

  const baseline: BaselineSummary[] = [];
  if (intendedUsdt !== null && initialFor(x.intent) > 0) {
    for (const cc of COST_CASES) {
      const comps = signal.eligible.map((e) =>
        compare({ intent: x.intent, decisionPrice: e.decisionPrice, endpointPrice: e.endpointPrice, initial: initialFor(x.intent), intendedUsdt, modeledUsdt, quantityDecimals: inst.quantityPrecision, slipBps: slipForRows, intendedExecutable, costCase: cc }),
      );
      baseline.push({
        costCase: cc,
        rows: comps.length,
        intendedVsNoTradeSum: comps.reduce((s, c) => s + (c.intended.endpointWealth - c.noTrade.endpointWealth), 0),
        modeledVsNoTradeSum: comps.reduce((s, c) => s + c.modeledVsNoTrade, 0),
        modeledVsIntendedSum: intendedExecutable ? comps.reduce((s, c) => s + (c.modeledVsIntended ?? 0), 0) : null,
        intendedWorseThanNoTrade: comps.filter((c) => c.intended.endpointWealth < c.noTrade.endpointWealth).length,
      });
    }
  }

  // Realized outcome: only for completed historical replays, shown after the decision.
  let realized: Card["realized"] = null;
  if (ctx.mode === "REPLAY" && session) {
    const ep = ctx.episodes.find((e) => e.key === session.key);
    if (ep && decisionPrice !== null && intendedUsdt !== null && initialFor(x.intent) > 0) {
      const ob = observe(ep, index, canonicalElapsed(ep));
      realized = {
        r: ob.r,
        g: ob.g,
        endpointPrice: ep.endpointPrice,
        reopenPrice: ep.reopenPrice,
        comparisons:
          ep.endpointPrice === null
            ? []
            : COST_CASES.map((cc) =>
                compare({ intent: x.intent, decisionPrice, endpointPrice: ep.endpointPrice as number, initial: initialFor(x.intent), intendedUsdt, modeledUsdt, quantityDecimals: inst.quantityPrecision, slipBps: slipForRows, intendedExecutable, costCase: cc }),
              ),
      };
    }
  }

  const transitionMs = session?.transitionMs ?? null;
  const cancellation: Card["cancellation"] = {
    status: "UNVERIFIED",
    rule: CANCELLATION_RULE,
    source: CANCELLATION_SOURCE,
    explanation:
      "Bitget documents the rule but no Bitget source available to Reanchor gives a timestamp for it. " +
      "It could correspond to the observed weekend-to-overnight transition or to the regular cash open, both shown separately on this card; Reanchor does not assume either. " +
      "Treat an unfilled weekend limit as at risk of cancellation from the observed transition onward, and verify with Bitget before relying on it.",
  };

  const limitations = [
    "Weekend prices are indicative Bitget quotes, not Nasdaq or NYSE transactions.",
    "H_t is a historical activity proxy from Bitget weekend candle turnover, not executable order-book depth.",
    "Comparisons assume hypothetical fills at observed quotes; whether a limit would have filled is UNKNOWN.",
    "Fee (0.10% per fill) and slippage (5 or 15 bps) are assumptions, not measured execution costs.",
    `Matched counts are small (minimum ${MIN_MATCHED_EPISODES}); this is not statistical significance or a probability forecast.`,
    "STAND DOWN means no proposed trade; an existing holding remains exposed to the reopening.",
  ];
  if (ctx.underlying?.status !== "VERIFIED") limitations.push("The underlying-stock anchor is UNKNOWN for this weekend; stock-linked scenarios are disabled.");

  const { eligible, excluded, ...sigRest } = signal;
  return {
    engine: ENGINE_VERSION,
    mode: ctx.mode,
    t,
    dataRetrievedAt: ctx.dataRetrievedAt,
    instrument: {
      symbol: inst.symbol, baseCoin: inst.baseCoin, underlying: inst.underlying, pricePrecision: inst.pricePrecision,
      quantityPrecision: inst.quantityPrecision, minOrderQty: inst.minOrderQty, minOrderAmount: inst.minOrderAmount,
    },
    intention: x,
    session: {
      phase: ctx.phase,
      key: session?.key ?? null,
      startMs: session?.startMs ?? null,
      transitionMs,
      reopenMs: session?.reopenMs ?? null,
      endpointMs: session?.endpointMs ?? null,
      calendarStatus: session?.calendarStatus ?? "UNKNOWN",
      verified: ctx.sessionVerification.verified,
      notes: [...(session?.calendarNotes ?? []), ...ctx.sessionVerification.notes],
    },
    observation: {
      fridayRef,
      fridayRefBarEndMs: fridayBar ? fridayBar.ts + BAR_MS : null,
      decisionPrice,
      decisionBarEndMs,
      ageMinutes: ageMs !== null ? Math.round(ageMs / MIN) : null,
      fresh,
      w,
      elapsedMs,
      cohortKind,
      fallback,
    },
    underlying: ctx.underlying,
    corporateAction: ctx.corporateAction,
    ht,
    signal: { ...sigRest, eligibleCount: eligible.length, excludedCount: excluded.length },
    action,
    side,
    hardFailures: hard,
    standDownReasons: action === "STAND_DOWN" ? [...hard, ...standDown] : [],
    sizing,
    band,
    slippageBps: slip,
    cancellation,
    history: rows,
    baseline,
    realized,
    limitations,
    context: ctx.context,
  };
}

/** Median basis of token reopening price over the underlying official open, from eligible episodes. */
export function medianReopenBasis(episodes: Episode[], before: number): number | null {
  const vals = episodes
    .filter((e) => e.completedAtMs < before && e.reopenPrice !== null && e.underlying?.reopenOpen)
    .map((e) => (e.reopenPrice as number) / (e.underlying!.reopenOpen as number) - 1);
  return vals.length ? median(vals) : null;
}
