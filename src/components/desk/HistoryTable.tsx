import type { Card } from "@/domain/decision";
import { fmtEtOrNa, fmtNum, fmtPct, fmtSignedUsdt } from "@/lib/format";
import { Badge, Notice, Section } from "../ui";

const COST_LABEL: Record<string, string> = { ZERO: "Zero costs", DEFAULT: "Default costs", DOUBLE_SLIPPAGE: "Doubled slippage" };

export function HistoryTable({ card }: { card: Card }) {
  const pp = card.instrument.pricePrecision;
  const rows = card.history;
  const included = rows.filter((r) => r.status !== "EXCLUDED");
  const kind = card.intention.intent === "BUY_DIP" ? "buy budget" : "holding";
  return (
    <Section
      id="history"
      title="Stress test against prior reopenings"
      description={`Your ${card.intention.intent === "HOLD" ? "25% trim" : "intended trade"} replayed on each prior weekend at observed quotes. Total return runs from the decision price to the end of the first regular-session hour and includes the reopening gap.`}
    >
      {included.length === 0 ? (
        <Notice tone="warn" title="No eligible prior weekends">
          No completed weekend before this decision met the boundary, session and corporate-action checks. See excluded rows below.
        </Notice>
      ) : null}
      <div className="table-wrap mt-3" role="region" aria-label="Historical weekends" tabIndex={0}>
        <table className="data-table">
          <caption className="sr-only">Prior weekends with decision, reopening and first-hour prices</caption>
          <thead>
            <tr>
              <th scope="col">Weekend</th>
              <th scope="col">Status</th>
              <th scope="col">Decision time</th>
              <th scope="col">Decision price</th>
              <th scope="col">Weekend move</th>
              <th scope="col">Reopen price</th>
              <th scope="col">Gap</th>
              <th scope="col">First-hour end</th>
              <th scope="col">Total return</th>
              <th scope="col">Prior eligible</th>
              <th scope="col">Intended vs no trade</th>
              <th scope="col">Modeled vs no trade</th>
              <th scope="col">Costs (default)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.status === "EXCLUDED" ? (
                <tr key={r.key} className="text-ink-3">
                  <td>{r.key}</td>
                  <td>
                    <Badge>Excluded</Badge>
                  </td>
                  <td colSpan={11} className="wrap">
                    {r.reasons.join("; ")}
                    {r.fallback && (
                      <span className="block text-xs">
                        Weaker fallback, display only: last earlier weekend quote {fmtNum(r.fallback.price, pp)} USDT at {fmtEtOrNa(r.fallback.barEndMs)}; not pooled.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                <tr key={r.key}>
                  <td>{r.key}</td>
                  <td>{r.status === "MATCHED" ? <Badge tone="accent">Matched</Badge> : <Badge>Eligible</Badge>}</td>
                  <td>{fmtEtOrNa(r.decisionMs)}</td>
                  <td>{fmtNum(r.decisionPrice, pp)}</td>
                  <td>{fmtPct(r.w)}</td>
                  <td>{fmtNum(r.reopenPrice, pp)}</td>
                  <td>{fmtPct(r.g)}</td>
                  <td>{fmtNum(r.endpointPrice, pp)}</td>
                  <td className={r.r !== null && r.r < 0 ? "text-bad" : r.r !== null && r.r > 0 ? "text-ok" : ""}>{fmtPct(r.r)}</td>
                  <td>{r.priorEligibleCount}</td>
                  <td>{r.comparison ? fmtSignedUsdt(r.comparison.intended.endpointWealth - r.comparison.noTrade.endpointWealth) : "n/a"}</td>
                  <td>{r.comparison ? fmtSignedUsdt(r.comparison.modeledVsNoTrade) : "n/a"}</td>
                  <td>{r.comparison ? fmtNum(r.comparison.intended.costs) : "n/a"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Prices in USDT per token. Wealth differences use a common initial {kind} and hypothetical fills at the observed decision quote and first-hour end;
        whether a weekend limit would have filled is UNKNOWN. Modeled clip is zero when the action is STAND DOWN.
      </p>

      {card.baseline.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Baseline comparison across eligible weekends</h3>
          <div className="table-wrap" role="region" aria-label="Baseline comparison" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Cost case</th>
                  <th scope="col">Weekends</th>
                  <th scope="col">Intended vs no trade (sum)</th>
                  <th scope="col">Modeled vs no trade (sum)</th>
                  <th scope="col">Modeled vs intended (sum)</th>
                  <th scope="col">Weekends where intended lost to no trade</th>
                </tr>
              </thead>
              <tbody>
                {card.baseline.map((b) => (
                  <tr key={b.costCase}>
                    <td>{COST_LABEL[b.costCase]}</td>
                    <td>{b.rows}</td>
                    <td>{fmtSignedUsdt(b.intendedVsNoTradeSum)}</td>
                    <td>{fmtSignedUsdt(b.modeledVsNoTradeSum)}</td>
                    <td>{b.modeledVsIntendedSum === null ? "Intended size non-executable" : fmtSignedUsdt(b.modeledVsIntendedSum)}</td>
                    <td>{b.intendedWorseThanNoTrade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Losing comparisons are shown as computed. Weekends from one calendar date are a single observation; these sums are descriptive, not a success rate.
          </p>
        </div>
      )}
    </Section>
  );
}

export function RealizedOutcome({ card }: { card: Card }) {
  if (card.mode !== "REPLAY" || !card.realized) return null;
  const rz = card.realized;
  return (
    <Section id="realized" title="What happened after this replay decision" description="Revealed after the decision time and never used by it. Hypothetical fills at observed quotes.">
      <dl className="mb-4 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-3">Reopen price</dt>
          <dd className="num font-medium">{fmtNum(rz.reopenPrice, card.instrument.pricePrecision)} USDT</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Gap from decision</dt>
          <dd className="num font-medium">{fmtPct(rz.g)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">First-hour end</dt>
          <dd className="num font-medium">{fmtNum(rz.endpointPrice, card.instrument.pricePrecision)} USDT</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Total reopening return</dt>
          <dd className="num font-medium">{fmtPct(rz.r)}</dd>
        </div>
      </dl>
      {rz.comparisons.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Replay outcome by cost case" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Cost case</th>
                <th scope="col">{rz.comparisons[0].modeled.label}</th>
                <th scope="col">{rz.comparisons[0].intended.label}</th>
                <th scope="col">{rz.comparisons[0].noTrade.label}</th>
                <th scope="col">Modeled vs no trade</th>
                <th scope="col">Modeled vs intended</th>
              </tr>
            </thead>
            <tbody>
              {rz.comparisons.map((c) => (
                <tr key={c.costCase}>
                  <td>{COST_LABEL[c.costCase]}</td>
                  <td>{fmtNum(c.modeled.endpointWealth)}</td>
                  <td>
                    {fmtNum(c.intended.endpointWealth)}
                    {!c.intended.executable && <span className="block text-xs text-ink-3">Quote benchmark only</span>}
                  </td>
                  <td>{fmtNum(c.noTrade.endpointWealth)}</td>
                  <td>{fmtSignedUsdt(c.modeledVsNoTrade)}</td>
                  <td>{c.modeledVsIntended === null ? "n/a" : fmtSignedUsdt(c.modeledVsIntended)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">Endpoint wealth in USDT on a common initial {card.intention.intent === "BUY_DIP" ? "budget" : "holding"}. No short positions are modeled.</p>
    </Section>
  );
}
