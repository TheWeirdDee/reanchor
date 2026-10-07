import { BarIndex, type Bar } from "../domain/candles";
import { sessionStateAt, type WeekendSession } from "../domain/calendar";
import { computeCard, medianReopenBasis, type Card, type ResearchContext } from "../domain/decision";
import type { ConfirmedIntention } from "../domain/intent";
import type { VerifiedInstrument } from "../domain/instruments";
import { anchorFor, corporateCheck, earningsNote, episodesFor, sessionsBetween, type Dataset } from "./dataset";

export interface ReplayOption {
  key: string;
  label: string;
  decisionMs: number;
  primaryEligible: boolean;
  note: string | null;
}

export function instrumentOrThrow(ds: Dataset, symbol: string): VerifiedInstrument {
  const inst = ds.supported.find((i) => i.symbol === symbol);
  if (!inst) throw new Error(`Unsupported instrument ${symbol}`);
  return inst;
}

export function allSessionsFor(ds: Dataset, inst: VerifiedInstrument, untilMs: number): WeekendSession[] {
  const idx = ds.bars[inst.symbol];
  const from = idx?.first ?? untilMs;
  return sessionsBetween(from, untilMs, ds.closures);
}

/** Completed weekends that can be replayed, newest first. */
export function replayOptions(ds: Dataset, symbol: string): ReplayOption[] {
  const inst = instrumentOrThrow(ds, symbol);
  const idx = ds.bars[inst.symbol];
  if (!idx || idx.last === null) return [];
  const sessions = allSessionsFor(ds, inst, idx.last);
  return episodesFor(ds, inst, sessions)
    .filter((e) => e.completedAtMs <= (idx.last as number))
    .map((e) => ({
      key: e.key,
      label: `Weekend of ${e.session.lastTradingDay}`,
      decisionMs: e.session.canonicalDecisionMs,
      primaryEligible: e.baseExclusions.length === 0,
      note: e.baseExclusions[0] ?? null,
    }))
    .reverse();
}

/**
 * Historical replay as of the canonical Sunday 20:00 ET decision of a completed weekend.
 * Only data available at that instant enters the decision; the realized outcome is attached separately.
 */
export function replayCard(ds: Dataset, intention: ConfirmedIntention, key: string, options?: ResearchContext["options"]): { card: Card; basis: number | null } {
  const inst = instrumentOrThrow(ds, intention.symbol);
  const idx = ds.bars[inst.symbol];
  const sessions = allSessionsFor(ds, inst, idx.last ?? 0);
  const session = sessions.find((s) => s.key === key);
  if (!session) throw new Error(`Unknown replay weekend ${key}`);
  const episodes = episodesFor(ds, inst, sessions);
  const t = session.canonicalDecisionMs;
  const card = computeCard({
    instrument: inst,
    intention,
    mode: "REPLAY",
    t,
    phase: "WEEKEND_BOOK",
    session,
    sessionVerification: { verified: session.calendarStatus === "RECONCILED", notes: ["Historical session from the verified NYSE calendar and Bitget Reality calendar"] },
    index: idx,
    allSessions: sessions,
    episodes,
    corporateAction: corporateCheck(ds, inst.underlying, session),
    underlying: anchorFor(ds, inst.underlying, session),
    dataRetrievedAt: String(ds.ingest.finishedAt),
    context: { earningsNote: earningsNote(ds, inst.underlying, session) },
    options,
  });
  return { card, basis: medianReopenBasis(episodes, t) };
}

export interface LiveInputs {
  now: number;
  liveBars: Bar[];
  liveRetrievedAt: string;
  closures: { startEt: string; endEt: string }[] | null;
  sessionVerification: { verified: boolean; notes: string[] };
  underlyingFridayClose: { close: number; date: string } | null;
  corporateLive: { status: "CLEAR" | "AFFECTED" | "UNKNOWN"; detail: string } | null;
}

/** Live decision at `now`, merging snapshot bars with freshly retrieved bars (live bars win on overlap). */
export function liveCard(ds: Dataset, intention: ConfirmedIntention, live: LiveInputs): { card: Card; basis: number | null } {
  const inst = instrumentOrThrow(ds, intention.symbol);
  const merged = new Map<number, Bar>();
  for (const b of ds.bars[inst.symbol]?.bars ?? []) merged.set(b.ts, b);
  for (const b of live.liveBars) merged.set(b.ts, b);
  const idx = new BarIndex([...merged.values()].sort((a, b) => a.ts - b.ts));
  const closures = live.closures ?? ds.closures;
  const state = sessionStateAt(live.now, live.closures);
  const sessions = sessionsBetween(idx.first ?? live.now, live.now, closures);
  const episodes = episodesFor(ds, inst, sessions.filter((s) => s.endpointMs < live.now)).map((e) => e);
  const session = state.phase === "WEEKEND_BOOK" ? state.session : null;
  const anchor = session
    ? live.underlyingFridayClose && live.underlyingFridayClose.date === session.lastTradingDay
      ? { fridayClose: live.underlyingFridayClose.close, fridayCloseDate: live.underlyingFridayClose.date, reopenOpen: null, reopenOpenDate: null, source: "Nasdaq.com historical quotes (official daily close)", status: "VERIFIED" as const, note: "Official regular-session close in USD; kept separate from token prices" }
      : { fridayClose: null, fridayCloseDate: null, reopenOpen: null, reopenOpenDate: null, source: "Nasdaq.com historical quotes", status: "UNKNOWN" as const, note: "Official close for the last trading day could not be retrieved" }
    : null;
  const card = computeCard({
    instrument: inst,
    intention,
    mode: "LIVE",
    t: live.now,
    phase: state.phase,
    session,
    sessionVerification: live.sessionVerification,
    index: idx,
    allSessions: sessions,
    episodes,
    corporateAction: live.corporateLive ?? (session ? corporateCheck(ds, inst.underlying, session) : { status: "UNKNOWN", detail: "No current weekend session" }),
    underlying: anchor,
    dataRetrievedAt: live.liveRetrievedAt,
    context: { earningsNote: session ? earningsNote(ds, inst.underlying, session) : null },
  });
  return { card, basis: medianReopenBasis(episodes, live.now) };
}

export function nextSessionInfo(ds: Dataset, now: number, closures: { startEt: string; endEt: string }[] | null) {
  const st = sessionStateAt(now, closures ?? ds.closures);
  return st;
}
