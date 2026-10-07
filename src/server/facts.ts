import type { Card } from "../domain/decision";
import { fmtEtOrNa, fmtNum, fmtPct } from "../lib/format";
import type { ExplanationFacts } from "./model";

/** Reduce a computed card to the facts the explanation may use. Numbers are pre-formatted strings. */
export function factsFromCard(card: Card): ExplanationFacts {
  return {
    action: card.action,
    side: card.side,
    instrument: card.instrument.baseCoin,
    intent: card.intention.intent,
    mode: card.mode === "LIVE" ? "live weekend data" : "historical replay snapshot",
    decisionTimeEt: card.observation.decisionBarEndMs ? fmtEtOrNa(card.observation.decisionBarEndMs) : null,
    weekendMovePct: card.observation.w !== null ? fmtPct(card.observation.w) : null,
    thresholdPct: card.signal.threshold !== null ? fmtPct(card.signal.threshold, 2, false) : null,
    signal: card.signal.signal,
    eligibleCount: card.signal.eligibleCount,
    matchedCount: card.signal.matchedCount,
    matchedMedianReturnPct: card.signal.matchedMedianR !== null ? fmtPct(card.signal.matchedMedianR) : null,
    proposedClipUsdt: card.sizing.proposedClipUsdt !== null ? fmtNum(card.sizing.proposedClipUsdt) : null,
    modeledClipUsdt: card.action !== "STAND_DOWN" && card.sizing.modeledClipUsdt !== null ? fmtNum(card.sizing.modeledClipUsdt) : null,
    htUsdtPerHour: card.ht.value !== null ? fmtNum(card.ht.value, 0) : null,
    participationPct: card.sizing.proposedParticipation !== null ? fmtPct(card.sizing.proposedParticipation, 1, false) : null,
    transitionTimeEt: card.session.transitionMs ? fmtEtOrNa(card.session.transitionMs) : null,
    cancellationRule: card.cancellation.rule,
    cancellationTiming: "NOT_VERIFIED",
    reopenTimeEt: card.session.reopenMs ? fmtEtOrNa(card.session.reopenMs) : null,
    standDownReasons: card.standDownReasons.slice(0, 4),
    anchorStatus: card.underlying ? `${card.underlying.status}${card.underlying.fridayClose !== null ? ` (official close ${fmtNum(card.underlying.fridayClose)} USD on ${card.underlying.fridayCloseDate})` : ""}` : "UNKNOWN",
    fillEvidence: "UNKNOWN",
    costAssumption: `fee 0.10% per modeled fill; slippage ${card.slippageBps ?? "n/a"} bps`,
    retrievedContext: [card.corporateAction.detail, card.context.earningsNote ?? ""].filter(Boolean),
  };
}
