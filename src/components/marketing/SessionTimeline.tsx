import { TimelineMotion } from "@/components/motion/Motion";

type Status = "documented" | "inferred" | "verified";

const STATUS_STYLE: Record<Status, string> = {
  documented: "bg-brand-soft text-brand-deep",
  inferred: "bg-vanilla text-ink",
  verified: "bg-ok-soft text-ok",
};

const PHASES: { when: string; title: string; body: string; status: Status; statusNote: string; width: string; tone: string }[] = [
  {
    when: "Fri 20:00 ET",
    title: "Weekend book opens",
    body: "US exchanges are closed. Bitget quotes rTokens from Friday's close, market makers and sentiment. Prices are indicative, not stock transactions.",
    status: "documented",
    statusNote: "Bitget support, FAQ 2",
    width: "md:col-span-5",
    tone: "bg-brand-deep",
  },
  {
    when: "Sun 20:00 ET",
    title: "Weekend quotes end",
    body: "Candles change from sparse weekend trades to overnight-session volume, and Bitget's calendar windows end at 20:00. No single document states this time.",
    status: "inferred",
    statusNote: "Calendar, states and candles",
    width: "md:col-span-3",
    tone: "bg-brand",
  },
  {
    when: "Mon 09:30 ET",
    title: "Regular session reopens",
    body: "The token re-anchors to the stock's live price. Reanchor measures from the weekend quote to the end of this first hour.",
    status: "verified",
    statusNote: "Bitget states, NYSE calendar, candles",
    width: "md:col-span-4",
    tone: "bg-[#5d8590]",
  },
];

export function SessionTimeline({ reopenCheck }: { reopenCheck: string | null }) {
  return (
    <TimelineMotion className="relative">
      <div className="grid gap-3 md:grid-cols-12">
        {PHASES.map((p) => (
          <div key={p.title} className={`${p.width} flex flex-col`}>
            <div data-segment className={`h-2 rounded-full ${p.tone}`} />
            <div data-marker className="mt-4 flex-1 rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="num font-mono text-sm font-semibold text-ink">{p.when}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${STATUS_STYLE[p.status]}`}>{p.status}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.body}</p>
              <p className="mt-3 text-xs text-ink-3">
                Basis: {p.statusNote}
                {p.status === "verified" && reopenCheck ? `; turnover step at 09:30 in ${reopenCheck} weekends` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </TimelineMotion>
  );
}

/** The documented cancellation rule, shown without any time attached. */
export function CancellationRule({ rule, source, scope, tone = "light" }: { rule: string; source: string; scope: string[]; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div className={`rounded-2xl border p-5 ${dark ? "border-white/15 bg-white/5" : "border-warn/30 bg-warn-soft"}`}>
      <p className={`text-sm font-semibold ${dark ? "text-vanilla" : "text-warn"}`}>Unfilled weekend limit orders: cancellation timing not verified</p>
      <blockquote className={`mt-2 text-[15px] leading-relaxed ${dark ? "text-mist" : "text-ink"}`}>&ldquo;{rule}&rdquo;</blockquote>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-mist-2" : "text-ink-2"}`}>
        Bitget documents the rule but not a timestamp. It could mean the Sunday transition or the Monday open; Reanchor assumes neither and never shows a cancellation deadline.
      </p>
      <p className={`mt-2 text-xs ${dark ? "text-mist-3" : "text-ink-3"}`}>
        Source: {source}.{scope.length ? ` The article lists ${scope.join(", ")} among weekend-tradable assets.` : ""}
      </p>
    </div>
  );
}
