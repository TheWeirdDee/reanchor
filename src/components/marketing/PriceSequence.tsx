import type { ReplayExample } from "@/server/presentation";
import { fmtDay, fmtNum } from "@/lib/format";

/**
 * Observed 15-minute token closes for one real weekend. Missing bars stay missing: the line breaks at every gap
 * and isolated weekend trades are drawn as single dots. Markers separate the documented weekend start, the inferred
 * Sunday transition and the verified Monday open. A compact variant is drawn for narrow screens.
 */
function Chart({ e, W, H, compact }: { e: ReplayExample; W: number; H: number; compact: boolean }) {
  const P = compact ? { l: 34, r: 10, t: 18, b: 24 } : { l: 52, r: 16, t: 34, b: 34 };
  const fs = compact ? 11 : 11;
  const pts = e.series;
  const vals = pts.filter((p) => p.close !== null).map((p) => p.close as number);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const t0 = pts[0].ts;
  const t1 = pts[pts.length - 1].ts;
  const x = (ts: number) => P.l + ((ts - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  const segments: string[] = [];
  const singles: { cx: number; cy: number }[] = [];
  let run: { cx: number; cy: number }[] = [];
  const flush = () => {
    if (run.length >= 2) segments.push(run.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(""));
    else if (run.length === 1) singles.push(run[0]);
    run = [];
  };
  for (const p of pts) {
    if (p.close === null) flush();
    else run.push({ cx: x(p.ts), cy: y(p.close) });
  }
  flush();

  const markers = [
    { key: "A", ts: e.times.weekendStart, label: "Weekend starts", sub: "documented", dashed: false },
    { key: "B", ts: e.times.transition, label: "Sunday transition", sub: "inferred", dashed: true },
    { key: "C", ts: e.times.reopen, label: "Monday open", sub: "verified", dashed: false },
  ];
  const ticks = [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Observed token closes for the weekend after ${fmtDay(e.lastTradingDay)}; gaps mark intervals with no trade.`} className="h-auto w-full">
      <rect x={x(e.times.weekendStart)} y={P.t} width={x(e.times.transition) - x(e.times.weekendStart)} height={H - P.t - P.b} fill="var(--color-brand-soft)" opacity="0.6" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize={fs - 1} fill="var(--color-ink-3)">
            {fmtNum(v, compact ? 0 : 1)}
          </text>
        </g>
      ))}
      {markers.map((m) => {
        const right = x(m.ts) > W - 160;
        const tx = right ? x(m.ts) - 5 : x(m.ts) + 5;
        const anchor = right ? "end" : "start";
        return (
          <g key={m.key}>
            <line x1={x(m.ts)} x2={x(m.ts)} y1={P.t - (compact ? 2 : 6)} y2={H - P.b} stroke="var(--color-brand)" strokeWidth="1.25" strokeDasharray={m.dashed ? "4 4" : undefined} />
            {compact ? (
              <g>
                <circle cx={x(m.ts)} cy={P.t - 8} r="7" fill="var(--color-brand-deep)" />
                <text x={x(m.ts)} y={P.t - 4.5} fontSize="9" fontWeight="700" fill="var(--color-mist)" textAnchor="middle">
                  {m.key}
                </text>
              </g>
            ) : (
              <>
                <text x={tx} y={P.t - 18} fontSize={fs} fill="var(--color-ink-2)" fontWeight="600" textAnchor={anchor}>
                  {m.label}
                </text>
                <text x={tx} y={P.t - 5} fontSize={fs - 1} fill="var(--color-ink-3)" textAnchor={anchor}>
                  {m.sub}
                </text>
              </>
            )}
          </g>
        );
      })}
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--color-brand-deep)" strokeWidth={compact ? 1.4 : 1.6} strokeLinejoin="round" />
      ))}
      {singles.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={compact ? 1.8 : 2.4} fill="var(--color-brand-deep)" />
      ))}
      {!compact && (
        <>
          <text x={P.l} y={H - 10} fontSize={fs} fill="var(--color-ink-3)">
            {fmtDay(e.lastTradingDay)}
          </text>
          <text x={W - P.r} y={H - 10} fontSize={fs} fill="var(--color-ink-3)" textAnchor="end">
            {fmtDay(e.nextTradingDay)}, first hour
          </text>
        </>
      )}
    </svg>
  );
}

export function PriceSequence({ e }: { e: ReplayExample }) {
  const vals = e.series.filter((p) => p.close !== null);
  if (vals.length < 2) return null;
  const missing = e.series.length - vals.length;
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <figcaption>
        <span className="block text-sm font-semibold text-ink">
          {e.baseCoin} observed 15-minute closes, Friday 20:00 ET to Monday 10:30 ET
        </span>
        <span className="mt-0.5 block text-xs text-ink-3">
          {e.series.length - missing} of {e.series.length} intervals traded · {missing} with no trade, left blank
        </span>
      </figcaption>
      <div className="mt-4 hidden sm:block">
        <Chart e={e} W={960} H={270} compact={false} />
      </div>
      <div className="mt-4 sm:hidden">
        <Chart e={e} W={360} H={230} compact />
        <ol className="mt-3 space-y-1 text-xs text-ink-2">
          <li>
            <span className="font-semibold">A</span> Weekend starts, {fmtDay(e.lastTradingDay)} 20:00 ET (documented)
          </li>
          <li>
            <span className="font-semibold">B</span> Sunday transition, 20:00 ET (inferred)
          </li>
          <li>
            <span className="font-semibold">C</span> Monday open, {fmtDay(e.nextTradingDay)} 09:30 ET (verified)
          </li>
        </ol>
      </div>
      <p className="mt-3 text-xs text-ink-3">Shaded: weekend book. Dots are isolated weekend trades with no neighbouring bar. Prices in USDT; the axis does not start at zero.</p>
    </figure>
  );
}
