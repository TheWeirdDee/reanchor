import { CalendarClock, CircleSlash, Scissors, ShoppingCart, Tag, TimerReset } from "lucide-react";
import type { Card } from "@/domain/decision";
import { INTENT_LABEL } from "@/domain/intent";
import { ACTION_LABEL, fmtEtOrNa, fmtNum, fmtPct, fmtUsdt } from "@/lib/format";
import { Badge, Fact, Notice } from "../ui";

function ActionIcon({ action, side }: { action: Card["action"]; side: Card["side"] }) {
  if (action === "STAND_DOWN") return <CircleSlash aria-hidden className="h-6 w-6" />;
  if (action === "TRIM") return <Scissors aria-hidden className="h-6 w-6" />;
  return side === "BUY" ? <ShoppingCart aria-hidden className="h-6 w-6" /> : <Tag aria-hidden className="h-6 w-6" />;
}

const SIGNAL_TEXT: Record<string, string> = {
  REVERSAL: "Reversal: matched weekends moved back against the weekend move by the end of the first hour",
  CONTINUATION: "Continuation: matched weekends kept moving in the weekend direction",
  INCONCLUSIVE: "Inconclusive: the matched median return was zero",
  CONFLICTING: "Conflicting: matched weekends disagree on direction",
  INSUFFICIENT: "Insufficient evidence for a directional conclusion",
};

export function DecisionCard({ card }: { card: Card }) {
  const standDown = card.action === "STAND_DOWN";
  const o = card.observation;
  const u = card.underlying;
  const s = card.sizing;
  const pp = card.instrument.pricePrecision;
  return (
    <article aria-labelledby="card-h" className="overflow-hidden rounded-[22px] border border-line-strong bg-surface shadow-[0_18px_40px_-28px_rgba(24,51,56,0.45)]">
      <header className="on-dark texture-grain shade-radial relative px-5 py-6 sm:px-7">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-mist">
              <ActionIcon action={card.action} side={card.side} />
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist-3">Decision for {card.instrument.baseCoin}</p>
              <h2 id="card-h" className="mt-1 text-3xl font-semibold tracking-tight text-mist sm:text-4xl">
                {ACTION_LABEL[card.action]}
                {card.side && <span className="ml-2 text-base font-medium text-mist-2">{card.side === "BUY" ? "spot buy" : "spot sale of existing holdings"}</span>}
              </h2>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-mist-2">
                {standDown ? (
                  "No trade is proposed. The evidence does not support acting this weekend; any existing holding stays exposed to the reopening."
                ) : (
                  <>
                    Model {card.action === "TRIM" ? "selling" : card.side === "BUY" ? "buying" : "selling"} up to <strong className="num text-mist">{fmtUsdt(s.modeledClipUsdt)}</strong> (
                    {fmtNum(s.quantity, card.instrument.quantityPrecision)} {card.instrument.baseCoin}). You decide whether to act; no order is sent.
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={card.mode === "LIVE" ? "accent" : "neutral"}>{card.mode === "LIVE" ? "Live weekend data" : "Historical replay snapshot"}</Badge>
            <Badge>{INTENT_LABEL[card.intention.intent]}</Badge>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        {standDown && card.standDownReasons.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink">Why the desk stands down</h3>
            <ul className="mt-2 space-y-1.5 text-[15px] text-ink-2">
              {card.standDownReasons.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {card.mode === "REPLAY" && (
          <Notice tone="neutral" title="Historical replay">
            This decision is computed as of {fmtEtOrNa(card.t)} using only data available then. It is not a current recommendation.
          </Notice>
        )}

        <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn" role="note">
          <p className="flex items-center gap-2 font-semibold">
            <TimerReset aria-hidden className="h-4 w-4" /> Cancellation timing not verified
          </p>
          <p className="mt-1 text-ink-2">
            Bitget&apos;s documented rule: &ldquo;{card.cancellation.rule}&rdquo;
          </p>
          <p className="mt-1 text-ink-2">{card.cancellation.explanation}</p>
          <p className="mt-1 text-xs text-ink-3">Source: {card.cancellation.source}.</p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:gap-2.5 xl:grid-cols-3">
          <Fact
            label="Observed weekend-to-overnight transition"
            value={fmtEtOrNa(card.session.transitionMs)}
            note={`Inferred from Bitget calendar and candles; not a verified cancellation time. Closure calendar ${card.session.calendarStatus.toLowerCase()}`}
          />
          <Fact label="Regular US cash-market open" value={fmtEtOrNa(card.session.reopenMs)} note="09:30 ET; first-hour endpoint 60 minutes later" />
          <Fact label="Observation" value={fmtEtOrNa(o.decisionBarEndMs)} note={o.ageMinutes !== null ? `${o.ageMinutes} min old at decision; ${o.fresh ? "fresh" : "stale"}` : "No closed weekend bar"} />
          <Fact label="Friday reference (token)" value={o.fridayRef !== null ? `${fmtNum(o.fridayRef, pp)} USDT` : "n/a"} note={`Close of bar ending ${fmtEtOrNa(o.fridayRefBarEndMs)}`} />
          <Fact label="Decision price (token)" value={o.decisionPrice !== null ? `${fmtNum(o.decisionPrice, pp)} USDT` : "n/a"} note="Indicative weekend quote" />
          <Fact label="Weekend move" value={fmtPct(o.w)} note={o.cohortKind === "CANONICAL" ? "Sunday 20:00 ET cohort" : o.cohortKind === "MATCHED" ? "Matched elapsed-weekend cutoff" : undefined} />
          <Fact
            label={`Underlying ${card.instrument.underlying} official close`}
            value={u?.fridayClose != null ? `${fmtNum(u.fridayClose)} USD` : "UNKNOWN"}
            note={u?.fridayClose != null ? `${u.fridayCloseDate}, ${u.source}` : u?.note ?? "Anchor unavailable"}
          />
          <Fact label="Underlying reopening open" value={u?.reopenOpen != null ? `${fmtNum(u.reopenOpen)} USD` : "Not printed"} note={u?.reopenOpen != null ? u.reopenOpenDate : "Shown only after the official open prints"} />
        </dl>

        <div className="border-t border-line pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarClock aria-hidden className="h-4 w-4 text-ink-3" /> Historical evidence
          </h3>
          <dl className="grid grid-cols-2 gap-2 sm:gap-2.5 xl:grid-cols-3">
            <Fact label="Extreme-move threshold" value={card.signal.threshold !== null ? fmtPct(card.signal.threshold, 2, false) : "n/a"} note="70th percentile of prior absolute weekend moves" />
            <Fact label="Eligible prior weekends" value={card.signal.eligibleCount} note={`${card.signal.excludedCount} excluded with reasons`} />
            <Fact label="Matched extreme weekends" value={card.signal.matchedCount} note="Same direction, beyond threshold; minimum 3" />
            <Fact label="Matched median total return" value={fmtPct(card.signal.matchedMedianR)} note={card.signal.agreement !== null ? `${Math.round(card.signal.agreement * 100)}% share its sign` : undefined} />
          </dl>
          <p className="mt-2 text-sm text-ink-2">{SIGNAL_TEXT[card.signal.signal]}. Small samples; not statistical significance or a probability forecast.</p>
        </div>

        <div className="border-t border-line pt-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Size and order checks</h3>
          <dl className="grid grid-cols-2 gap-2 sm:gap-2.5 xl:grid-cols-3">
            <Fact label="Intended clip" value={fmtUsdt(s.proposedClipUsdt)} note={card.intention.intent === "HOLD" ? "25% of the stated holding" : "Your proposed trade size"} />
            <Fact
              label="Modeled clip"
              value={standDown ? "None (STAND DOWN)" : fmtUsdt(s.modeledClipUsdt)}
              note={s.provisional ? "Provisional capacity only" : s.capacityUsdt !== null ? `Capacity ${fmtUsdt(s.capacityUsdt)}` : undefined}
            />
            <Fact label="H_t hourly turnover" value={card.ht.value !== null ? `${fmtNum(card.ht.value, 0)} USDT/h` : "Unavailable"} note="Median of the last 3 weekend-session medians" />
            <Fact label="Participation" value={s.proposedParticipation !== null ? fmtPct(s.proposedParticipation, 1, false) : "n/a"} note="Intended clip / H_t; hard limit 25%, cap 10%" />
            <Fact
              label="Limit band"
              value={card.band.status === "INSIDE_APPROX" ? "Inside (approximate)" : card.band.status === "OUTSIDE" ? "Outside" : card.band.status === "NOT_APPLICABLE" ? "Not applicable" : "Unknown"}
              note={card.band.note}
            />
            <Fact
              label="Band range"
              value={
                card.band.weekendLower !== null && card.band.instrumentLower !== null
                  ? `${fmtNum(Math.max(card.band.weekendLower, card.band.instrumentLower), pp)} to ${fmtNum(Math.min(card.band.weekendUpper!, card.band.instrumentUpper!), pp)}`
                  : "n/a"
              }
              note="Narrower of ~20% around the Friday reference and the instrument ratio around the decision price"
            />
            <Fact label="Costs assumed" value={`0.10% fee + ${card.slippageBps ?? "n/a"} bps`} note="Per modeled fill; assumptions, not measured" />
            <Fact label="Limit fill" value="UNKNOWN" note="Candles touching a price do not prove a fill" />
          </dl>
          {s.reductionReasons.length > 0 && <p className="mt-2 text-xs text-ink-3">Size reductions: {s.reductionReasons.join("; ")}.</p>}
          <p className="mt-2 text-xs text-ink-3">H_t is a historical activity proxy from Bitget weekend candle turnover, not executable order-book depth.</p>
        </div>

        <div className="border-t border-line pt-5 text-sm">
          <h3 className="mb-1 font-semibold text-ink">Context</h3>
          <p className="text-ink-2">Corporate actions: {card.corporateAction.status}. {card.corporateAction.detail}</p>
          {card.context.earningsNote && <p className="mt-1 text-ink-2">{card.context.earningsNote}.</p>}
          {card.session.notes.length > 0 && <p className="mt-1 text-xs text-ink-3">Session checks: {card.session.notes.join("; ")}.</p>}
        </div>

        <details className="group rounded-2xl border border-line bg-paper/60 px-4 py-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink">
            Limitations ({card.limitations.length})
            <span aria-hidden className="chev text-ink-3">+</span>
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-2">
            {card.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </div>
    </article>
  );
}
