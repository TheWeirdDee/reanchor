import type { BarIndex } from "./candles";
import type { WeekendSession } from "./calendar";
import { BAR_MS, HOUR } from "./time";
import { median } from "./stats";

/**
 * Bitget changelog (2026-07-09): Reality candle volume/turnover became valid on this date;
 * earlier values may be empty and were not backfilled. Turnover before this instant is not used.
 */
export const TURNOVER_VALID_FROM_MS = Date.UTC(2026, 6, 9, 4, 0); // 2026-07-09 00:00 ET

/**
 * Minimum complete hourly groups for a weekend session's median to be eligible.
 * Product assumption (docs/METHOD.md): a median over very few active hours is not a usable activity proxy.
 */
export const MIN_COMPLETE_HOURS = 6;

export interface SessionTurnover {
  key: string;
  startMs: number;
  transitionMs: number;
  totalHours: number;
  completeHours: number;
  /** Median of complete hourly USDT turnover sums; null when ineligible. */
  medianHourlyUsdt: number | null;
  eligible: boolean;
  reason: string | null;
}

/**
 * Median hourly quote turnover for one completed weekend session.
 * An hour counts only when all four 15m bars wholly inside the weekend book exist with non-null turnover.
 * Missing bars are not treated as zero.
 */
export function sessionHourlyTurnover(session: WeekendSession, index: BarIndex, minCompleteHours = MIN_COMPLETE_HOURS): SessionTurnover {
  const sums: number[] = [];
  let totalHours = 0;
  for (let h = session.startMs; h + HOUR <= session.transitionMs; h += HOUR) {
    totalHours++;
    let sum = 0;
    let complete = true;
    for (let k = 0; k < 4; k++) {
      const b = index.starting(h + k * BAR_MS);
      if (!b || b.quoteTurnover === null || b.ts < TURNOVER_VALID_FROM_MS) {
        complete = false;
        break;
      }
      sum += b.quoteTurnover;
    }
    if (complete) sums.push(sum);
  }
  let reason: string | null = null;
  if (session.startMs < TURNOVER_VALID_FROM_MS) reason = "Session predates valid Reality turnover (2026-07-09)";
  else if (sums.length < Math.max(1, minCompleteHours)) reason = `Only ${sums.length} complete hourly groups (minimum ${Math.max(1, minCompleteHours)})`;
  const eligible = reason === null;
  return {
    key: session.key,
    startMs: session.startMs,
    transitionMs: session.transitionMs,
    totalHours,
    completeHours: sums.length,
    medianHourlyUsdt: eligible ? median(sums) : null,
    eligible,
    reason,
  };
}

export interface HtResult {
  /** USDT per hour; null when unavailable. */
  value: number | null;
  sessions: SessionTurnover[];
  reason: string | null;
}

/**
 * H_t: the median of the latest three weekend-session medians completed strictly before t (never the evaluated weekend).
 * All three sessions must be eligible; otherwise H_t is missing (STAND DOWN).
 */
export function computeHt(t: number, sessions: WeekendSession[], index: BarIndex, minCompleteHours = MIN_COMPLETE_HOURS): HtResult {
  // Strictly before t: at the canonical decision (t equals the weekend's own transition) the evaluated weekend is excluded.
  const completed = sessions.filter((s) => s.transitionMs < t).sort((a, b) => b.transitionMs - a.transitionMs).slice(0, 3);
  const st = completed.map((s) => sessionHourlyTurnover(s, index, minCompleteHours));
  if (st.length < 3) return { value: null, sessions: st, reason: `Only ${st.length} completed weekend sessions before the decision` };
  const bad = st.filter((s) => !s.eligible);
  if (bad.length) return { value: null, sessions: st, reason: bad.map((b) => `${b.key}: ${b.reason}`).join("; ") };
  return { value: median(st.map((s) => s.medianHourlyUsdt as number)), sessions: st, reason: null };
}
