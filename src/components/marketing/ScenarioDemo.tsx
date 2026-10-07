"use client";

import { useId, useState } from "react";
import { runScenario, SCENARIO_MAX, SCENARIO_MIN } from "@/domain/scenario";
import { fmtNum, fmtPct, fmtSignedUsdt } from "@/lib/format";

/**
 * Interactive scenario using the same pure scenario function as the desk, fed with the real replay's official close,
 * decision quote and observed basis. The computed action is shown next to the slider and never changes with it.
 */
export function ScenarioDemo({
  underlying,
  fridayClose,
  decisionPrice,
  basis,
  holdingUsdt,
  action,
  pricePrecision,
}: {
  underlying: string;
  fridayClose: number | null;
  decisionPrice: number | null;
  basis: number | null;
  holdingUsdt: number | null;
  action: string;
  pricePrecision: number;
}) {
  const id = useId();
  const [gap, setGap] = useState(-5);
  const r = runScenario({
    intent: "HOLD",
    underlyingFridayClose: fridayClose,
    underlyingGap: gap / 100,
    basis: basis ?? 0,
    decisionPrice,
    modeledClipUsdt: 0,
    intendedUsdt: null,
    holdingUsdt,
  });
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-semibold text-ink">
          Hypothetical {underlying} reopening vs official close: <span className="num">{fmtPct(gap / 100, 1)}</span>
        </label>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-deep">Action stays {action}</span>
      </div>
      <input
        id={id}
        type="range"
        min={SCENARIO_MIN * 100}
        max={SCENARIO_MAX * 100}
        step={0.5}
        value={gap}
        onChange={(ev) => setGap(Number(ev.target.value))}
        aria-valuetext={`${gap} percent`}
        className="mt-4 w-full accent-[var(--color-brand)]"
      />
      <div className="flex justify-between text-xs text-ink-3">
        <span>{SCENARIO_MIN * 100}%</span>
        <span>0%</span>
        <span>+{SCENARIO_MAX * 100}%</span>
      </div>
      {r.enabled ? (
        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-line px-3 py-2.5">
            <dt className="text-xs text-ink-3">{underlying} implied (USD)</dt>
            <dd className="num mt-0.5 font-semibold">{fmtNum(r.underlyingImplied)}</dd>
          </div>
          <div className="rounded-xl border border-line px-3 py-2.5">
            <dt className="text-xs text-ink-3">Token implied, with basis {fmtPct(basis ?? 0, 2)}</dt>
            <dd className="num mt-0.5 font-semibold">{fmtNum(r.tokenEndpointImplied, pricePrecision)} USDT</dd>
          </div>
          <div className="rounded-xl border border-line px-3 py-2.5">
            <dt className="text-xs text-ink-3">Holding change if kept</dt>
            <dd className="num mt-0.5 font-semibold">{fmtSignedUsdt(r.holdingChange)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-3">{r.disabledReason}.</p>
      )}
      <p className="mt-4 text-xs text-ink-3">
        Hypothetical, before costs. The range is a chosen exploration range, not a loss limit, Bitget&apos;s order band or a probability.
      </p>
    </div>
  );
}
