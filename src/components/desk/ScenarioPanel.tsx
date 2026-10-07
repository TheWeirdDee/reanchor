"use client";

import { useId, useState } from "react";
import type { Card } from "@/domain/decision";
import { runScenario, SCENARIO_MAX, SCENARIO_MIN } from "@/domain/scenario";
import { proposedClip } from "@/domain/sizing";
import { fmtNum, fmtPct, fmtSignedUsdt } from "@/lib/format";
import { inputClass, Notice, Section } from "../ui";

export function ScenarioPanel({ card, defaultBasis }: { card: Card; defaultBasis: number | null }) {
  const sliderId = useId();
  const basisId = useId();
  const [gapPct, setGapPct] = useState(0);
  const [basisPct, setBasisPct] = useState<string>(defaultBasis !== null ? (defaultBasis * 100).toFixed(2) : "");
  const basis = basisPct.trim() === "" ? null : Number(basisPct) / 100;
  const x = card.intention;
  const res = runScenario({
    intent: x.intent,
    underlyingFridayClose: card.underlying?.status === "VERIFIED" ? card.underlying.fridayClose : null,
    underlyingGap: gapPct / 100,
    basis: basis !== null && Number.isFinite(basis) ? basis : null,
    decisionPrice: card.observation.decisionPrice,
    modeledClipUsdt: card.action === "STAND_DOWN" ? 0 : (card.sizing.modeledClipUsdt ?? 0),
    intendedUsdt: proposedClip(x.intent, x.holdingUsdt, x.tradeUsdt),
    holdingUsdt: x.holdingUsdt,
  });
  return (
    <Section
      id="scenario"
      title="Hypothetical reopening scenario"
      description="Explore an underlying-stock reopening gap. This is a chosen range, not a loss limit, not Bitget's order band and not a probability. It does not change the historical evidence or the action above."
    >
      {!res.enabled && res.disabledReason?.includes("UNKNOWN") ? (
        <Notice tone="warn" title="Stock-linked scenario disabled">
          {res.disabledReason}. The token price is never substituted for the stock.
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={sliderId} className="text-sm font-medium text-ink">
            Underlying reopening gap vs official close: <span className="num">{fmtPct(gapPct / 100, 1)}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={SCENARIO_MIN * 100}
            max={SCENARIO_MAX * 100}
            step={0.5}
            value={gapPct}
            onChange={(e) => setGapPct(Number(e.target.value))}
            className="mt-3 h-6 w-full accent-[var(--color-brand)]"
            aria-valuetext={`${gapPct} percent`}
          />
          <div className="flex justify-between text-xs text-ink-3">
            <span>-20%</span>
            <span>0%</span>
            <span>+20%</span>
          </div>
        </div>
        <div>
          <label htmlFor={basisId} className="text-sm font-medium text-ink">
            Token vs stock basis assumption (%)
          </label>
          <input
            id={basisId}
            inputMode="decimal"
            value={basisPct}
            onChange={(e) => setBasisPct(e.target.value)}
            className={`num ${inputClass} border-line-strong`}
          />
          <p className="mt-1 text-xs text-ink-3">
            {defaultBasis !== null
              ? `Default: median of observed token reopen price vs official open on prior weekends (${fmtPct(defaultBasis, 2)}). Editable.`
              : "No observed basis available; enter an assumption."}
          </p>
        </div>
      </div>
      {res.enabled ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-3">Underlying implied ({card.instrument.underlying})</dt>
            <dd className="num font-medium">{fmtNum(res.underlyingImplied)} USD</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Token endpoint implied</dt>
            <dd className="num font-medium">{fmtNum(res.tokenEndpointImplied, card.instrument.pricePrecision)} USDT</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Token change from decision price</dt>
            <dd className="num font-medium">{fmtPct(res.tokenReturnFromDecision)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Modeled clip vs no trade</dt>
            <dd className="num font-medium">{fmtSignedUsdt(res.modeledPnl)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Intended clip vs no trade</dt>
            <dd className="num font-medium">{fmtSignedUsdt(res.intendedPnl)}</dd>
          </div>
          {x.holdingUsdt !== null && (
            <div>
              <dt className="text-xs text-ink-3">Existing holding change if unchanged</dt>
              <dd className="num font-medium">{fmtSignedUsdt(res.holdingChange)}</dd>
            </div>
          )}
        </dl>
      ) : (
        !res.disabledReason?.includes("UNKNOWN") && <p className="mt-3 text-sm text-ink-3">{res.disabledReason}.</p>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Before costs. Scenario values are hypothetical and are never mixed into observed metrics. A token price inside Bitget&apos;s approximate band does not imply
        the stock will reopen there, and the token may keep a basis to the stock after the reopening.
      </p>
    </Section>
  );
}
