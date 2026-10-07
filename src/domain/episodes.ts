import type { BarIndex } from "./candles";
import type { WeekendSession } from "./calendar";
import { BAR_MS } from "./time";

/** Underlying-stock reference values, kept separate from token prices. */
export interface UnderlyingAnchor {
  /** Official close on the last trading day before the weekend, USD. */
  fridayClose: number | null;
  fridayCloseDate: string | null;
  /** Official open on the reopening day, USD, once printed. */
  reopenOpen: number | null;
  reopenOpenDate: string | null;
  source: string;
  status: "VERIFIED" | "UNKNOWN";
  note: string;
}

export interface CorporateActionCheck {
  status: "CLEAR" | "AFFECTED" | "UNKNOWN";
  detail: string;
}

/** Everything about one weekend for one instrument that does not depend on the decision cutoff. */
export interface Episode {
  symbol: string;
  key: string;
  session: WeekendSession;
  /** Close of the 15m bar ending exactly at the weekend start (Friday 20:00 ET for a standard weekend). */
  fridayRef: number | null;
  /** Open of the 15m bar starting at the regular reopening. */
  reopenPrice: number | null;
  /** Close of the 15m bar ending 60 minutes after the reopening. */
  endpointPrice: number | null;
  /** Episode outcome becomes known at this instant. */
  completedAtMs: number;
  corporateAction: CorporateActionCheck;
  underlying: UnderlyingAnchor | null;
  /** Reasons this episode cannot enter the primary cohort (independent of cutoff). */
  baseExclusions: string[];
}

export interface Observation {
  decisionMs: number;
  /** Close of the bar ending exactly at decisionMs, or null when that bar is missing. */
  decisionPrice: number | null;
  /** Weaker fallback: latest earlier weekend bar close; display-only, never pooled. */
  fallbackPrice: number | null;
  fallbackBarEndMs: number | null;
  w: number | null;
  g: number | null;
  r: number | null;
  exclusions: string[];
}

export function buildEpisode(
  symbol: string,
  session: WeekendSession,
  index: BarIndex,
  corporateAction: CorporateActionCheck,
  underlying: UnderlyingAnchor | null,
  turnoverOrDataNotes: string[] = [],
): Episode {
  const fridayBar = index.endingAt(session.startMs);
  const reopenBar = index.starting(session.reopenMs);
  const endpointBar = index.endingAt(session.endpointMs);
  const ex: string[] = [...turnoverOrDataNotes];
  if (!session.standard) ex.push(...session.nonstandardReasons.map((r) => `Nonstandard session: ${r}`));
  if (session.calendarStatus !== "RECONCILED") ex.push(`Closure calendar ${session.calendarStatus.toLowerCase()}: ${session.calendarNotes.join("; ")}`);
  if (!fridayBar) ex.push("Missing 15m bar ending at the weekend start (Friday reference)");
  if (!reopenBar) ex.push("Missing 15m bar starting at the regular reopening");
  if (!endpointBar) ex.push("Missing 15m bar ending 60 minutes after the reopening");
  if (corporateAction.status === "AFFECTED") ex.push(`Corporate action: ${corporateAction.detail}`);
  if (corporateAction.status === "UNKNOWN") ex.push(`Corporate-action status unknown: ${corporateAction.detail}`);
  return {
    symbol,
    key: session.key,
    session,
    fridayRef: fridayBar?.close ?? null,
    reopenPrice: reopenBar?.open ?? null,
    endpointPrice: endpointBar?.close ?? null,
    completedAtMs: session.endpointMs,
    corporateAction,
    underlying,
    baseExclusions: ex,
  };
}

/**
 * Observe an episode at an elapsed weekend cutoff (milliseconds after the weekend start).
 * The canonical historical cutoff is Sunday 20:00 ET, i.e. 48 hours for a standard weekend.
 */
export function observe(ep: Episode, index: BarIndex, elapsedMs: number): Observation {
  const decisionMs = ep.session.startMs + Math.floor(elapsedMs / BAR_MS) * BAR_MS;
  const exclusions: string[] = [];
  if (decisionMs > ep.session.transitionMs) exclusions.push("Cutoff falls after the observed weekend-to-overnight transition for this episode");
  const bar = index.endingAt(decisionMs);
  const decisionPrice = bar && decisionMs <= ep.session.transitionMs ? bar.close : null;
  let fallbackPrice: number | null = null;
  let fallbackBarEndMs: number | null = null;
  if (decisionPrice === null) {
    exclusions.push("Missing 15m bar ending exactly at the decision cutoff");
    const fb = index.latestEndingBy(Math.min(decisionMs, ep.session.transitionMs), decisionMs - ep.session.startMs);
    if (fb && fb.ts >= ep.session.startMs) {
      fallbackPrice = fb.close;
      fallbackBarEndMs = fb.ts + BAR_MS;
    }
  }
  const w = decisionPrice !== null && ep.fridayRef !== null ? decisionPrice / ep.fridayRef - 1 : null;
  const g = decisionPrice !== null && ep.reopenPrice !== null ? ep.reopenPrice / decisionPrice - 1 : null;
  const r = decisionPrice !== null && ep.endpointPrice !== null ? ep.endpointPrice / decisionPrice - 1 : null;
  return { decisionMs, decisionPrice, fallbackPrice, fallbackBarEndMs, w, g, r, exclusions };
}

export const CANONICAL_ELAPSED_MS = 48 * 3_600_000;

export function canonicalElapsed(ep: Episode): number {
  return ep.session.canonicalDecisionMs - ep.session.startMs;
}
