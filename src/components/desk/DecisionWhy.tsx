import type { Card } from "@/domain/decision";
import { MIN_ELIGIBLE_EPISODES, MIN_MATCHED_EPISODES } from "@/domain/signal";
import { ACTION_LABEL, fmtEtOrNa, fmtNum, fmtPct } from "@/lib/format";

const INTENT_NAME = { HOLD: "Hold: check whether to trim", BUY_DIP: "Buy the dip", SELL_POP: "Sell into a pop" } as const;

/** The user's own question, restated from the confirmed intention. */
export function intentSummary(card: Card): string {
  const x = card.intention;
  const parts: string[] = [INTENT_NAME[x.intent], card.instrument.baseCoin];
  if (x.holdingUsdt !== null) parts.push(`holding ${fmtNum(x.holdingUsdt, 0)} USDT`);
  if (x.tradeUsdt !== null) parts.push(`${x.intent === "BUY_DIP" ? "buy" : "sell"} ${fmtNum(x.tradeUsdt, 0)} USDT`);
  if (x.limitPrice !== null) parts.push(`limit ${fmtNum(x.limitPrice, card.instrument.pricePrecision)}`);
  return parts.join(" · ");
}

type Finding = { value: string; note: string; met: boolean | null };

/** What the evidence check found, in the order the engine applies it. */
function finding(card: Card): Finding {
  const sig = card.signal;
  const w = card.observation.w;
  if (sig.eligibleCount < MIN_ELIGIBLE_EPISODES) return { value: `${sig.eligibleCount} eligible`, note: `At least ${MIN_ELIGIBLE_EPISODES} prior weekends are needed`, met: false };
  if (sig.threshold === null || w === null) return { value: "Move unknown", note: "No decision quote to compare", met: false };
  if (!sig.extreme) return { value: `${fmtPct(w)} move`, note: `Extreme needs beyond ${fmtPct(sig.threshold, 2, false)}`, met: false };
  if (sig.matchedCount < MIN_MATCHED_EPISODES) return { value: `${sig.matchedCount} matched`, note: `${MIN_MATCHED_EPISODES} required`, met: false };
  return { value: `${sig.matchedCount} matched`, note: `${MIN_MATCHED_EPISODES} required; signal ${sig.signal.toLowerCase()}`, met: true };
}

/** One-line statement of the rule that produced the action. */
function ruleApplied(card: Card): string {
  if (card.hardFailures.length) return `Required check failed: ${card.hardFailures[0]}`;
  if (card.action !== "STAND_DOWN") return `${ACTION_LABEL[card.action]}: ${card.signal.signal.toLowerCase()} after an extreme ${card.observation.w !== null && card.observation.w > 0 ? "rise" : "fall"} matches the ${INTENT_NAME[card.intention.intent].toLowerCase()} intent`;
  return card.standDownReasons[0] ?? "Evidence threshold not met";
}

/** Four answers: what was asked, what was compared, what was found, which rule decided. */
export function WhyGrid({ card }: { card: Card }) {
  const f = finding(card);
  const cells = [
    { k: "You asked", v: intentSummary(card), n: "Your confirmed intention" },
    { k: "Compared against", v: `${card.signal.eligibleCount} prior weekends`, n: `Only weekends finished before the decision; ${card.signal.excludedCount} excluded with reasons` },
    { k: "Evidence found", v: f.value, n: f.note },
    { k: "Rule applied", v: ruleApplied(card), n: card.action === "STAND_DOWN" ? "Deterministic rule; no model involved" : "Deterministic rule; size checked below" },
  ];
  return (
    <div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cells.map((c) => (
          <div key={c.k} className="min-w-0 rounded-xl border border-line bg-paper/60 px-3.5 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{c.k}</dt>
            <dd className="mt-1 break-words text-[15px] font-semibold leading-snug text-ink">{c.v}</dd>
            <dd className="mt-1 text-xs leading-snug text-ink-3">{c.n}</dd>
          </div>
        ))}
      </dl>
      {card.signal.eligibleCount >= MIN_ELIGIBLE_EPISODES && card.signal.extreme && <ThresholdMeter matched={card.signal.matchedCount} />}
    </div>
  );
}

/** Matched comparable extremes against the required count, as filled and empty slots. */
function ThresholdMeter({ matched }: { matched: number }) {
  const met = matched >= MIN_MATCHED_EPISODES;
  const slots = Math.max(MIN_MATCHED_EPISODES, matched);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3" role="img" aria-label={`${matched} matched comparable extreme weekends; ${MIN_MATCHED_EPISODES} required`}>
      <span className="text-sm font-semibold text-ink">Comparable extreme weekends</span>
      <span className="flex gap-1.5" aria-hidden>
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={`h-4 w-8 rounded-full border ${i < matched ? "border-brand-deep bg-brand-deep" : "border-line-strong bg-transparent"}`} />
        ))}
      </span>
      <span className="num text-sm text-ink-2">
        {matched} found · {MIN_MATCHED_EPISODES} required · <strong className={met ? "text-ok" : "text-warn"}>{met ? "threshold met" : "threshold not met"}</strong>
      </span>
    </div>
  );
}

/**
 * Information boundary for a replay: the decision is made at the Sunday quote; the reopening and the
 * first-hour end happen later and are not visible to the rules.
 */
export function ChronologyStrip({ card }: { card: Card }) {
  const points = [
    { label: "Friday reference", time: card.observation.fridayRefBarEndMs, side: "before" as const },
    { label: "Decision", time: card.t, side: "decision" as const },
    { label: "Reopening", time: card.session.reopenMs, side: "after" as const },
    { label: "First-hour end", time: card.session.endpointMs, side: "after" as const },
  ];
  return (
    <div className="rounded-xl border border-line bg-paper/60 px-3.5 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Information boundary</p>
      <ol className="mt-2 grid grid-cols-4 gap-0">
        {points.map((p, i) => (
          <li key={p.label} className="relative min-w-0">
            <div className={`h-1.5 ${i === 0 ? "rounded-l-full" : ""} ${i === points.length - 1 ? "rounded-r-full" : ""} ${p.side === "after" ? "bg-[repeating-linear-gradient(90deg,var(--color-line-strong)_0_6px,transparent_6px_10px)]" : "bg-brand"}`} />
            {p.side === "decision" && <span aria-hidden className="absolute -top-1.5 left-0 h-4.5 w-1 rounded bg-brand-deep" />}
            <p className={`mt-2 text-[13px] font-semibold ${p.side === "decision" ? "text-brand-deep" : p.side === "after" ? "text-ink-3" : "text-ink"}`}>{p.side === "decision" ? "Decision here" : p.label}</p>
            <p className="num text-xs text-ink-3">{fmtEtOrNa(p.time)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-3">Everything right of the decision marker was not available to the rules. It is revealed below only after the decision.</p>
    </div>
  );
}
