import Link from "next/link";
import { ArrowRight, CircleSlash, Scissors, ShoppingCart, Tag } from "lucide-react";
import type { ReplayExample } from "@/server/presentation";
import { INTENT_LABEL } from "@/domain/intent";
import { fmtDay, fmtNum, fmtPct, fmtEt } from "@/lib/format";

export function plainReason(e: ReplayExample): string {
  const c = e.causes[0]?.code;
  if (c === "INADEQUATE_SAMPLE" && e.sample.eligible >= 6) {
    return `Only ${e.sample.matched} prior weekend matched a move this size; the rule needs ${e.sample.required} before it will suggest a trade.`;
  }
  if (c === "MOVE_NOT_EXTREME" && e.move.w !== null && e.move.threshold !== null) {
    return `The weekend move of ${fmtPct(e.move.w)} was inside the historical range (threshold ${fmtPct(e.move.threshold, 2, false)}), so there is no extreme move to act on.`;
  }
  return e.causes[0]?.label ?? e.primaryReason;
}

function intentSummary(e: ReplayExample): string {
  const x = e.intention;
  if (x.intent === "HOLD") return `${INTENT_LABEL.HOLD}, holding ${fmtNum(x.holdingUsdt, 0)} USDT`;
  if (x.intent === "BUY_DIP") return `${INTENT_LABEL.BUY_DIP}, ${fmtNum(x.tradeUsdt, 0)} USDT`;
  return `${INTENT_LABEL.SELL_POP}, ${fmtNum(x.tradeUsdt, 0)} of ${fmtNum(x.holdingUsdt, 0)} USDT held`;
}

function ActionIcon({ action }: { action: ReplayExample["action"] }) {
  const cls = "h-5 w-5";
  if (action === "STAND_DOWN") return <CircleSlash aria-hidden className={cls} />;
  if (action === "TRIM") return <Scissors aria-hidden className={cls} />;
  return action === "FADE" ? <Tag aria-hidden className={cls} /> : <ShoppingCart aria-hidden className={cls} />;
}

/** Compact product preview of a real sourced replay. Used in the hero and elsewhere; all values come from the engine. */
export function ReplayPreview({ e, sourcesHref = "/method#integrations", compact = false }: { e: ReplayExample; sourcesHref?: string; compact?: boolean }) {
  const pp = e.pricePrecision;
  const rows: [string, string, string, string][] = [
    ["Friday reference", fmtEt(e.times.weekendStart).replace(" ET", ""), e.prices.fridayRef !== null ? fmtNum(e.prices.fridayRef, pp) : "n/a", "Token close"],
    ["Sunday decision", fmtEt(e.times.transition).replace(" ET", ""), e.prices.decision !== null ? fmtNum(e.prices.decision, pp) : "n/a", fmtPct(e.move.w)],
    ["Monday reopening", fmtEt(e.times.reopen).replace(" ET", ""), e.prices.reopen !== null ? fmtNum(e.prices.reopen, pp) : "n/a", `gap ${fmtPct(e.move.g)}`],
    ["First-hour end", fmtEt(e.times.endpoint).replace(" ET", ""), e.prices.endpoint !== null ? fmtNum(e.prices.endpoint, pp) : "n/a", `total ${fmtPct(e.move.r)}`],
  ];
  return (
    <article aria-label={`Replay of ${e.baseCoin}, weekend after ${fmtDay(e.lastTradingDay)}`} className="overflow-hidden rounded-[22px] border border-line bg-surface text-ink shadow-[0_30px_80px_-30px_rgb(24_51_56/0.55)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-brand-deep px-2 py-1 font-mono text-xs font-semibold text-mist">{e.baseCoin}</span>
          <span className="text-sm text-ink-2">Weekend after {fmtDay(e.lastTradingDay)}</span>
        </div>
        <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Historical replay</span>
      </header>

      <div className="space-y-4 px-5 py-5">
        <div>
          <p className="text-xs font-medium text-ink-3">Confirmed intent</p>
          <p className="mt-0.5 text-[15px] font-medium">{intentSummary(e)}</p>
        </div>

        <div className="rounded-2xl border border-brand/20 bg-brand-soft/60 p-4">
          <div className="flex items-center gap-2.5 text-brand-deep">
            <ActionIcon action={e.action} />
            <p className="text-xl font-semibold tracking-tight">{e.action === "STAND_DOWN" ? "STAND DOWN" : e.action}</p>
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{plainReason(e)}</p>
          {e.action === "STAND_DOWN" && <p className="mt-1.5 text-sm text-ink-3">No trade is proposed; a holding you keep stays exposed to the reopening.</p>}
        </div>

        <dl className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {rows.map(([label, when, price, note]) => (
            <div key={label} className="bg-surface px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</dt>
              <dd className="num mt-1 text-[17px] font-semibold">{price}</dd>
              <dd className="num text-xs text-ink-3">{note}</dd>
              {!compact && <dd className="num mt-0.5 text-[11px] text-ink-3">{when}</dd>}
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-3">Token prices in USDT from Bitget 15-minute candles. Weekend prices are indicative quotes, not stock transactions.</p>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        <span className="text-xs text-ink-3">
          {e.sample.eligible} eligible prior weekends · {e.sample.matched} matched · {e.sample.required} required
        </span>
        <Link href={sourcesHref} className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand hover:text-brand-deep">
          Sources and limitations <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </footer>
    </article>
  );
}
