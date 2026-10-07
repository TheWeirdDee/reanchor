import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getPresentation } from "@/server/presentation";
import { loadEvidence } from "@/server/evidence";
import { ACTION_LABEL, fmtDay, fmtNum, fmtPct, fmtSignedUsdt } from "@/lib/format";
import { Container, Eyebrow, StatusPill } from "@/components/site/primitives";
import { HeroMotion, Reveal } from "@/components/motion/Motion";
import { CancellationRule, SessionTimeline } from "@/components/marketing/SessionTimeline";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: "Method & evidence", description: "How Reanchor measures weekend reopenings, sizes a clip, maps intent to action and evaluates chronologically, with current coverage, integration status, assumptions and open questions.", path: "/method" });

const TOC = [
  ["coverage", "Current coverage"],
  ["sessions", "Sessions and calendar"],
  ["measurement", "Weekend measurement"],
  ["turnover", "Turnover denominator"],
  ["signals", "Signals and intent mapping"],
  ["sizing", "Sizing and modeled costs"],
  ["evaluation", "Chronological evaluation"],
  ["provenance", "Source provenance"],
  ["integrations", "Integration status"],
  ["assumptions", "Assumptions and open questions"],
] as const;

const utc = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "n/a");

function Block({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <Reveal as="section" id={id} aria-labelledby={`${id}-h`} className="border-t border-line py-12 first:border-t-0 first:pt-0">
      <div data-reveal>
        <Eyebrow index={n}>{TOC.find((t) => t[0] === id)?.[1]}</Eyebrow>
      </div>
      <h2 id={`${id}-h`} data-reveal className="display-md mt-3 text-ink">
        {title}
      </h2>
      <div data-reveal className="mt-5 space-y-4 text-[16px] leading-relaxed text-ink-2">
        {children}
      </div>
    </Reveal>
  );
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-12 items-center justify-between gap-4 rounded-2xl px-5 py-3 text-[15px] font-semibold text-ink">
        {summary}
        <ChevronDown aria-hidden className="chev h-5 w-5 shrink-0 text-ink-3 transition-transform" />
      </summary>
      <div className="space-y-3 border-t border-line px-5 py-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

interface EvalRowLite {
  key: string;
  evaluable: boolean;
  w: number | null;
  threshold: number | null;
  matched: number;
  ht: number | null;
  signal: string;
  action: string;
  standDownReasons: string[];
}

export default function MethodPage() {
  const p = getPresentation();
  const ev = loadEvidence();
  const a = p.assumptions;
  const i = p.integrations;
  const val = ev.validation;
  const evals = ev.evaluations;
  const sym = p.coverage.supported[0]?.symbol;
  const holdRows = ((sym && (evals?.evaluations[sym]?.intents.HOLD as unknown as { rows?: EvalRowLite[] })?.rows) || []).filter((r) => r.evaluable);

  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="on-dark texture-grain shade-radial relative overflow-hidden rounded-[var(--radius-frame)]">
          <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
          <HeroMotion className="relative">
            <Container className="py-14 sm:py-20">
              <div data-hero>
                <Eyebrow tone="dark">Method & evidence</Eyebrow>
              </div>
              <h1 data-hero className="display-xl mt-5 max-w-[15ch] text-mist">
                How every number is made, and what is still unknown.
              </h1>
              <p data-hero className="lede mt-6 max-w-2xl text-mist-2">
                Measurement rules, current coverage, the chronological evaluation, source status and the assumptions behind them. Counts on this page are read from the saved records.
              </p>
              <dl data-hero className="mt-8 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/10 text-sm sm:grid-cols-4">
                {[
                  ["Data snapshot", utc(p.snapshot.pulledAt)],
                  ["Replays generated", utc(p.snapshot.evaluatedAt)],
                  ["Supported rTokens", `${p.coverage.supported.length} of ${p.coverage.candidates}`],
                  ["Evaluated weekends", `${p.validation.evaluatedWeekends}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-brand-deep/60 px-4 py-3">
                    <dt className="text-xs text-mist-3">{k}</dt>
                    <dd className="num mt-1 font-semibold text-mist">{v}</dd>
                  </div>
                ))}
              </dl>
            </Container>
          </HeroMotion>
        </div>
      </section>

      <Container className="grid gap-10 py-14 lg:grid-cols-[220px_1fr] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-3">On this page</p>
          <ol className="mt-3 flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
            {TOC.map(([id, label], n) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink lg:flex">
                  <span className="mr-2 font-mono text-xs text-ink-3">{String(n + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 max-w-[860px]">
          <Block id="coverage" n="01" title={`${p.coverage.supported.length} of ${p.coverage.candidates} candidate rTokens have enough weekend history.`}>
            <p>
              All {p.coverage.candidates} candidates are verified Bitget Reality spot instruments. Support needs at least {a.minEligible + 1} weekends with every boundary price present and 3 weekend sessions with usable turnover. Sparse weekend bars first appear on {fmtDay(p.coverage.firstWeekendWithAnyBar)}; the first weekend with all four boundary prices is {fmtDay(p.coverage.firstBoundaryCompleteWeekend)}.
            </p>
            {val && (
              <div className="table-wrap" role="region" aria-label="Coverage by instrument" tabIndex={0}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">rToken</th>
                      <th scope="col">Underlying</th>
                      <th scope="col">Weekends seen</th>
                      <th scope="col">Boundary-complete</th>
                      <th scope="col">Turnover sessions</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(val.instruments).map(([s, x]) => (
                      <tr key={s}>
                        <td>
                          {x.baseCoin} <span className="text-ink-3">({s})</span>
                        </td>
                        <td>{x.underlying}</td>
                        <td>{x.weekends}</td>
                        <td>{x.boundaryCompleteCanonical}</td>
                        <td>{x.turnoverEligibleSessions}</td>
                        <td className="wrap min-w-[18rem]">{val.supported.includes(s) ? <StatusPill tone="ok">Supported</StatusPill> : <span className="text-ink-3">{val.unsupported[x.baseCoin]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Block>

          <Block id="sessions" n="02" title="Three different moments, each with its own evidence.">
            <p>Times use America/New_York through the IANA time-zone database. NYSE holidays and early closes for 2026 and 2027 decide the next trading day; weekends touching them are excluded and current decisions on them stand down.</p>
            <SessionTimeline reopenCheck={p.session.reopenCheck} />
            <CancellationRule rule={p.cancellation.rule} source={p.cancellation.source} scope={p.cancellation.scopeUnderlyings} />
            <Disclosure summary="Clock and calendar reconciliation details">
              <p>
                Bitget&apos;s market-states endpoint reported <code className="inline">daylightType: {p.session.daylightTypeReported ?? "n/a"}</code> on {utc(p.session.reportedAt)}, while New York was on daylight time. The regular open is confirmed from candles instead: the turnover steps up at least fivefold exactly at the IANA 09:30 ET bar in {p.session.reopenCheck ?? "n/a"} checked weekends. A live disagreement the candles cannot resolve disables the action.
              </p>
              <p>Holidays must appear in Bitget&apos;s closure calendar as windows ending 20:00 ET on the holiday; a holiday missing from it marks the weekend unreconciled.</p>
            </Disclosure>
          </Block>

          <Block id="measurement" n="03" title="From the weekend quote to the end of Monday's first hour.">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Friday reference: close of the token&apos;s 15-minute bar ending exactly at the weekend start.</li>
              <li>Decision: close of the bar ending at Sunday 20:00 ET for replays; live checks use the latest closed weekend bar and compare prior weekends at the same elapsed time.</li>
              <li>Reopening: open of the bar starting at 09:30 ET. Endpoint: close of the bar ending 60 minutes later.</li>
              <li>The total return from the decision quote to the endpoint includes the reopening gap and is the comparison target.</li>
              <li>Missing bars are never filled. A missing boundary excludes the weekend; underlying-stock prices are shown separately and never mixed into token returns.</li>
            </ul>
          </Block>

          <Block id="turnover" n="04" title="One denominator for every size check: H_t.">
            <p>
              Hourly turnover is the sum of four complete 15-minute bars inside the weekend book. Each weekend session&apos;s median needs at least {a.minCompleteHours} complete hours. H_t is the median of the three most recent session medians completed strictly before the decision, in USDT per hour. Turnover before {p.coverage.turnoverValidFrom?.slice(0, 10) ?? "n/a"} is not used because Bitget states earlier values may be invalid.
            </p>
            <p>H_t is a historical activity proxy, not executable depth.</p>
          </Block>

          <Block id="signals" n="05" title="An extreme move, a matched sample, then the intent decides.">
            <p>
              At least {a.minEligible} eligible prior weekends are required. A move is extreme beyond the {Math.round(a.extremePercentile * 100)}th percentile of their absolute weekend moves (linear interpolation). At least {a.minMatched} same-direction extreme weekends must exist; their median total return decides reversal or continuation. If fewer than {Math.round(a.agreementMin * 100)}% of matched returns share the median&apos;s sign, the sample is conflicting.
            </p>
            <div className="table-wrap" role="region" aria-label="Intent to action mapping" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Intent</th>
                    <th scope="col">Signal and move</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Hold</td>
                    <td className="wrap">Extreme rise, reversal</td>
                    <td className="wrap">TRIM: sell up to {fmtPct(a.holdTrimFraction, 0, false)} of the holding</td>
                  </tr>
                  <tr>
                    <td>Buy the dip</td>
                    <td className="wrap">Extreme fall, reversal</td>
                    <td className="wrap">FADE: spot buy</td>
                  </tr>
                  <tr>
                    <td>Sell into a pop</td>
                    <td className="wrap">Extreme rise, reversal, enough holdings</td>
                    <td className="wrap">FADE: sale of held tokens</td>
                  </tr>
                  <tr>
                    <td>Any</td>
                    <td className="wrap">Anything else or any failed check</td>
                    <td className="wrap">STAND DOWN with reasons</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Disclosure summary="Hard failures that force STAND DOWN">
              <p>
                Not inside the weekend quote window; a holiday or early-close weekend; closure calendar or clock not verified; a decision price more than {a.freshnessMinutes} minutes old; missing boundary, history, turnover or precision; corporate-action status not clear; fewer than {a.minEligible} eligible weekends; a missing limit for a buy or sale; insufficient holdings; a limit outside the approximate band; or an intended clip above {fmtPct(a.hardParticipation, 0, false)} of H_t.
              </p>
            </Disclosure>
          </Block>

          <Block id="sizing" n="06" title="Sizing, order band and modeled costs.">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Modeled clip: the smallest of the intended clip, {fmtPct(a.modeledCap, 0, false)} of H_t and, when selling, the holding value; floored to the instrument&apos;s quantity precision and minimum notional.</li>
              <li>Order band (approximate): within about {fmtPct(a.weekendBand, 0, false)} of the Friday token reference and the instrument&apos;s limit-price ratio. Inside the band does not guarantee acceptance or a fill.</li>
              <li>
                Costs: {(a.feeRate * 100).toFixed(2)}% fee per modeled fill; slippage {a.slippageTiers.map((t) => `${t.bps} bps up to ${fmtPct(t.maxParticipation, 0, false)} participation`).join(", ")}. Zero, default and doubled-slippage cases are reported. All are assumptions.
              </li>
              <li>Comparisons assume fills at observed quotes. Whether a weekend limit would have filled is unknown, and no win rate is reported.</li>
            </ul>
          </Block>

          <Block id="evaluation" n="07" title={`${p.validation.evaluatedWeekends} evaluated weekends, ${p.validation.actionRows} trade suggestions.`}>
            <p>
              The replay covers {p.validation.uniqueWeekends} unique weekends for {p.validation.instruments} instrument{p.validation.instruments === 1 ? "" : "s"}, each read under {p.validation.intents} intents: {p.validation.replayRows} replay rows. The intents are three readings of the same market weekends, not independent observations. {p.validation.evaluatedWeekends} weekends had enough history to evaluate; a headline rate would need {p.validation.headlineMinEvaluations}. The most matched extreme weekends in any evaluation was {p.validation.maxMatchedInEvaluated}, against {p.validation.minMatchedRequired} required.
            </p>
            {holdRows.length > 0 && (
              <div className="table-wrap" role="region" aria-label="Evaluated weekends" tabIndex={0}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Weekend</th>
                      <th scope="col">Weekend move</th>
                      <th scope="col">Threshold</th>
                      <th scope="col">Matched</th>
                      <th scope="col">H_t (USDT/h)</th>
                      <th scope="col">Result and reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdRows.map((r) => (
                      <tr key={r.key}>
                        <td>{fmtDay(r.key)}</td>
                        <td>{fmtPct(r.w)}</td>
                        <td>{fmtPct(r.threshold, 2, false)}</td>
                        <td>{r.matched}</td>
                        <td>{fmtNum(r.ht, 0)}</td>
                        <td className="wrap">{r.action === "STAND_DOWN" ? `STAND DOWN: ${r.standDownReasons[0] ?? "no reason recorded"}` : ACTION_LABEL[r.action] ?? r.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm text-ink-3">Weekend dates are the Saturday of each weekend. Rows shown for the Hold intent.{" "}
              {p.validation.actionRows === 0
                ? `All ${p.validation.replayRows} replay rows across the ${p.validation.intents} intents were STAND DOWN; results by intent are below.`
                : `${p.validation.actionRows} of ${p.validation.replayRows} replay rows produced FADE or TRIM; results by intent are below.`}</p>
            {evals && sym && (
              <Disclosure summary="Results by intent, with cost sensitivity">
                <div className="table-wrap" role="region" aria-label="Results by intent" tabIndex={0}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Intent</th>
                        <th scope="col">Evaluated</th>
                        <th scope="col">Actions</th>
                        <th scope="col">Intended vs no trade, default costs</th>
                        <th scope="col">Zero costs</th>
                        <th scope="col">Doubled slippage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evals.evaluations[sym].intents).map(([intent, v]) => (
                        <tr key={intent}>
                          <td>{intent}</td>
                          <td>{v.evaluatedAfterWarmup}</td>
                          <td>{v.actions}</td>
                          <td>{fmtSignedUsdt(v.wealthDifferenceUsdt.DEFAULT?.intendedVsNoTrade)}</td>
                          <td>{fmtSignedUsdt(v.wealthDifferenceUsdt.ZERO?.intendedVsNoTrade)}</td>
                          <td>{fmtSignedUsdt(v.wealthDifferenceUsdt.DOUBLE_SLIPPAGE?.intendedVsNoTrade)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>Sums are descriptive, from predeclared reference inputs, with fills assumed at observed quotes. They are not a track record.</p>
                <p>
                  Holdout: {p.validation.holdout.symbol ?? "none"} was designated for holdout validation but {p.validation.holdout.available ? "is available" : "does not meet the data gate, so holdout validation is unavailable"}.
                </p>
              </Disclosure>
            )}
          </Block>

          <Block id="provenance" n="08" title="Where each number comes from.">
            <div className="table-wrap" role="region" aria-label="Source provenance" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Source</th>
                    <th scope="col">Retrieved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Historical 15m token bars</td>
                    <td className="wrap">Bitget v3 history-candles (saved snapshot)</td>
                    <td>{utc(p.snapshot.pulledAt)}</td>
                  </tr>
                  <tr>
                    <td>Live 15m token bars</td>
                    <td className="wrap">Bitget Agent Hub MCP market.candles; direct v3 as labeled fallback</td>
                    <td>At request time</td>
                  </tr>
                  <tr>
                    <td>Session calendar and states</td>
                    <td className="wrap">Bitget Reality calendar and states; NYSE holiday calendar</td>
                    <td>{utc(p.session.reportedAt)}</td>
                  </tr>
                  <tr>
                    <td>Corporate actions</td>
                    <td className="wrap">{i.corporateActions.label}</td>
                    <td>{utc(i.corporateActions.retrievedAt)}</td>
                  </tr>
                  <tr>
                    <td>Underlying official open and close</td>
                    <td className="wrap">{i.underlying.source ?? "n/a"}</td>
                    <td>{utc(i.underlying.retrievedAt)}</td>
                  </tr>
                  <tr>
                    <td>Weekend order rule</td>
                    <td className="wrap">{p.cancellation.source}</td>
                    <td>Saved copy</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Block>

          <Block id="integrations" n="09" title="Integration status, as last recorded.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Bitget Agent Hub MCP</h3>
                  <StatusPill tone={i.agentHub.status === "WORKING" ? "ok" : "bad"}>{i.agentHub.status === "WORKING" ? "Working" : i.agentHub.status === "NOT_RUN" ? "Not run" : "Failing"}</StatusPill>
                </div>
                <p className="mt-2 text-sm">
                  {i.agentHub.okCalls}/{i.agentHub.calls} real read-only calls succeeded and {i.agentHub.checksOk}/{i.agentHub.checks} values matched the saved dataset ({utc(i.agentHub.lastRunAt)}). Supplies live token candles and instrument metadata only.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Bitget AI data MCP</h3>
                  <StatusPill tone={i.dataMcp.status === "AVAILABLE" ? "ok" : "warn"}>{i.dataMcp.status === "AVAILABLE" ? "Available" : i.dataMcp.status === "UNKNOWN" ? "Unknown" : "Unavailable"}</StatusPill>
                </div>
                <p className="mt-2 text-sm">
                  {i.dataMcp.outcome} (last checked {utc(i.dataMcp.lastCheckedAt)}). Intended source for corporate actions and earnings dates. Earnings dates: {i.earnings.available ? "available" : "unavailable"}.
                </p>
                {i.dataMcp.summaryOnlyRefreshes > 0 && (
                  <p className="mt-2 text-xs text-ink-3">
                    Of {i.dataMcp.refreshAttempts} recorded refresh attempts, the first {i.dataMcp.summaryOnlyRefreshes} retain attempt summaries rather than individual failure receipts.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Corporate actions</h3>
                  <StatusPill tone={i.corporateActions.source === "BITGET_AI_MCP" ? "ok" : "warn"}>{i.corporateActions.source === "FALLBACK" ? "Fallback" : i.corporateActions.source === "BITGET_AI_MCP" ? "Primary" : "Unavailable"}</StatusPill>
                </div>
                <p className="mt-2 text-sm">{i.corporateActions.label}. Every card says which source it used.</p>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Language model</h3>
                  <StatusPill tone={i.model.configured && i.model.realCallOk ? "ok" : "warn"}>{i.model.configured ? (i.model.realCallOk ? "Verified" : "Unverified") : "Not configured"}</StatusPill>
                </div>
                <p className="mt-2 text-sm">
                  {i.model.model} ({i.model.provider}); last verified against the provider&apos;s models endpoint and a real call {utc(i.model.checkedAt)}. Parses requests and explains computed cards; cannot change the action or size.
                </p>
              </div>
            </div>
          </Block>

          <Block id="assumptions" n="10" title="Assumptions and open questions.">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Cancellation timing of unfilled weekend limits is not verified; only the rule is documented.</li>
              <li>The Sunday 20:00 ET transition is inferred from calendar, states and candles, not documented as one statement.</li>
              <li>
                The {a.minCompleteHours}-hour turnover minimum and the {Math.round(a.agreementMin * 100)}% agreement rule are implementation additions; sensitivity runs show they changed no outcome. The {a.freshnessMinutes}-minute freshness limit is a product assumption, not an exchange rule.
              </li>
              <li>Fees, slippage and fills are modeled. Turnover is an activity proxy.</li>
              <li>Weekend trading is sparse, so live checks often stand down on stale prices.</li>
              <li>No user study has been run yet; the usability protocol is planned.</li>
            </ul>
            <p>
              Ready to try it?{" "}
              <Link href="/desk" className="rounded font-semibold text-brand hover:text-brand-deep">
                Open the desk
              </Link>
              .
            </p>
          </Block>
        </div>
      </Container>
    </>
  );
}
