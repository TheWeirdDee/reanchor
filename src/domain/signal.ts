import type { BarIndex } from "./candles";
import { canonicalElapsed, observe, type Episode, type Observation } from "./episodes";
import { median, percentileLinear, sign } from "./stats";

export const MIN_ELIGIBLE_EPISODES = 6;
export const MIN_MATCHED_EPISODES = 3;
export const EXTREME_PERCENTILE = 0.7;
/**
 * Product assumption (docs/METHOD.md): a matched sample "conflicts" when fewer than two thirds of
 * matched total reopening returns share the sign of their median. Conflicting samples give STAND DOWN.
 */
export const AGREEMENT_MIN = 2 / 3;

export type Signal = "REVERSAL" | "CONTINUATION" | "INCONCLUSIVE" | "CONFLICTING" | "INSUFFICIENT";

export interface CohortRow {
  key: string;
  decisionMs: number;
  decisionPrice: number;
  fridayRef: number;
  reopenPrice: number;
  endpointPrice: number;
  w: number;
  g: number;
  r: number;
  matched: boolean;
}

export interface ExcludedRow {
  key: string;
  reasons: string[];
  fallbackPrice: number | null;
  fallbackBarEndMs: number | null;
}

export interface SignalResult {
  /** Decision instant t; only episodes completed strictly before t are used. */
  t: number;
  elapsedMs: number;
  eligible: CohortRow[];
  excluded: ExcludedRow[];
  threshold: number | null;
  extreme: boolean;
  matchedCount: number;
  matchedMedianR: number | null;
  agreement: number | null;
  signal: Signal;
  notes: string[];
}

/**
 * Cutoff for prior weekends: "CANONICAL" observes each prior weekend at its own Sunday 20:00 ET decision
 * (correct across daylight-saving weekends); a number observes each at that elapsed time after its start.
 */
export type Cutoff = "CANONICAL" | number;

/**
 * Select the chronological cohort for a decision at t with the current weekend move w.
 * Every episode must have completed (its first regular hour ended) before t.
 * The evaluated episode and all later episodes are never visible here.
 */
export function evaluateSignal(t: number, w: number | null, cutoff: Cutoff, episodes: Episode[], index: BarIndex, agreementMin = AGREEMENT_MIN): SignalResult {
  const elapsedMs = cutoff === "CANONICAL" ? -1 : cutoff;
  const prior = episodes.filter((e) => e.completedAtMs < t).sort((a, b) => a.session.startMs - b.session.startMs);
  const eligible: CohortRow[] = [];
  const excluded: ExcludedRow[] = [];
  for (const ep of prior) {
    const ob: Observation = observe(ep, index, cutoff === "CANONICAL" ? canonicalElapsed(ep) : cutoff);
    const reasons = [...ep.baseExclusions, ...ob.exclusions];
    if (reasons.length || ob.w === null || ob.r === null || ob.g === null) {
      excluded.push({ key: ep.key, reasons: reasons.length ? reasons : ["Incomplete observation"], fallbackPrice: ob.fallbackPrice, fallbackBarEndMs: ob.fallbackBarEndMs });
      continue;
    }
    eligible.push({
      key: ep.key,
      decisionMs: ob.decisionMs,
      decisionPrice: ob.decisionPrice as number,
      fridayRef: ep.fridayRef as number,
      reopenPrice: ep.reopenPrice as number,
      endpointPrice: ep.endpointPrice as number,
      w: ob.w,
      g: ob.g,
      r: ob.r,
      matched: false,
    });
  }
  const notes: string[] = [];
  const base = { t, elapsedMs, eligible, excluded };
  if (eligible.length < MIN_ELIGIBLE_EPISODES) {
    notes.push(`${eligible.length} eligible prior episodes; at least ${MIN_ELIGIBLE_EPISODES} required`);
    return { ...base, threshold: null, extreme: false, matchedCount: 0, matchedMedianR: null, agreement: null, signal: "INSUFFICIENT", notes };
  }
  const threshold = percentileLinear(eligible.map((e) => Math.abs(e.w)), EXTREME_PERCENTILE);
  const extreme = w !== null && w !== 0 && Math.abs(w) > threshold;
  if (w === null) {
    notes.push("Current weekend move unavailable");
    return { ...base, threshold, extreme: false, matchedCount: 0, matchedMedianR: null, agreement: null, signal: "INSUFFICIENT", notes };
  }
  for (const e of eligible) e.matched = sign(e.w) === sign(w) && sign(w) !== 0 && Math.abs(e.w) > threshold;
  const matched = eligible.filter((e) => e.matched);
  if (matched.length < MIN_MATCHED_EPISODES) {
    notes.push(`${matched.length} matched same-direction extreme episodes; at least ${MIN_MATCHED_EPISODES} required`);
    return { ...base, threshold, extreme, matchedCount: matched.length, matchedMedianR: matched.length ? median(matched.map((m) => m.r)) : null, agreement: null, signal: "INSUFFICIENT", notes };
  }
  const medR = median(matched.map((m) => m.r));
  const s = sign(medR);
  const agreement = s === 0 ? 0 : matched.filter((m) => sign(m.r) === s).length / matched.length;
  let signal: Signal;
  if (s === 0) signal = "INCONCLUSIVE";
  else if (agreement < agreementMin) signal = "CONFLICTING";
  else signal = s === -sign(w) ? "REVERSAL" : "CONTINUATION";
  return { ...base, threshold, extreme, matchedCount: matched.length, matchedMedianR: medR, agreement, signal, notes };
}
