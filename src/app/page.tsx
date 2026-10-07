import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { getPresentation } from "@/server/presentation";
import { INTENT_LABEL } from "@/domain/intent";
import { ACTION_LABEL, fmtDay, fmtNum, fmtPct, fmtEt } from "@/lib/format";
import { pageMetadata, WORKFLOW_STEPS } from "@/lib/site";
import { Container, ButtonLink, Eyebrow, SectionHeading } from "@/components/site/primitives";
import { HeroMotion, Reveal } from "@/components/motion/Motion";
import { ReplayPreview, plainReason } from "@/components/marketing/ReplayPreview";
import { PriceSequence } from "@/components/marketing/PriceSequence";
import { CancellationRule, SessionTimeline } from "@/components/marketing/SessionTimeline";
import { WorkflowDemo } from "@/components/marketing/WorkflowDemo";
import { CtaBand, EvidenceMap, Faq, Limitations } from "@/components/marketing/Sections";

// Rendered per request from the memoized presentation model, so new data appears without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: "Reanchor: a weekend quote, a Monday decision", description: "Stress-test an intended rToken trade against prior market reopenings. Review the evidence, modeled size and the weekend order rule before you decide.", path: "/", absoluteTitle: true });

const utc = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "n/a");

export default function Landing() {
  const p = getPresentation();
  const e = p.example;
  const sentence = e
    ? e.intention.intent === "HOLD"
      ? `I hold ${fmtNum(e.intention.holdingUsdt, 0)} USDT of ${e.baseCoin} and want to check whether to trim.`
      : `I want to ${e.intention.intent === "BUY_DIP" ? "buy" : "sell"} ${fmtNum(e.intention.tradeUsdt, 0)} USDT of ${e.baseCoin}.`
    : "";

  return (
    <>
      {/* Hero: inset deep-slate frame with grain, grid and technical lines. */}
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="on-dark texture-grain shade-radial relative overflow-hidden rounded-[var(--radius-frame)]">
          <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
          <HeroMotion className="relative">
            <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-24">
              <div>
                <div data-hero>
                  <Eyebrow tone="dark">Weekend rToken stress test</Eyebrow>
                </div>
                <h1 data-hero className="display-xl mt-5 max-w-[12ch] text-mist">
                  A weekend quote. A Monday decision.
                </h1>
                <p data-hero className="lede mt-6 max-w-xl text-mist-2">
                  Stress-test your intended rToken trade against prior market reopenings. Review the evidence, modeled size, and weekend order rule before you decide.
                </p>
                <div data-hero className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/desk" tone="dark">
                    Open desk
                  </ButtonLink>
                  <ButtonLink href="#replay" tone="dark" variant="secondary">
                    See a real replay
                  </ButtonLink>
                </div>
                <p data-hero className="mt-8 flex items-center gap-2 text-sm text-mist-3">
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                  Research only. No orders, no account connection.
                </p>
              </div>

              <div className="relative">
                <svg aria-hidden className="pointer-events-none absolute -left-14 top-10 hidden h-[70%] w-14 lg:block" viewBox="0 0 56 300" fill="none" preserveAspectRatio="none">
                  <path data-draw pathLength={1} strokeDasharray="1" d="M0 30 H28 V150 H56" stroke="rgb(246 244 239 / 0.3)" strokeWidth="1" />
                  <path data-draw pathLength={1} strokeDasharray="1" d="M0 150 H56" stroke="rgb(246 244 239 / 0.3)" strokeWidth="1" />
                  <path data-draw pathLength={1} strokeDasharray="1" d="M0 270 H28 V150" stroke="rgb(246 244 239 / 0.3)" strokeWidth="1" />
                </svg>
                <div data-hero-preview>
                  {e ? (
                    <ReplayPreview e={e} compact sourcesHref="#replay" />
                  ) : (
                    <div className="rounded-2xl border border-white/15 p-6 text-mist-2">No verified replay is available in the current dataset.</div>
                  )}
                </div>
              </div>
            </Container>
          </HeroMotion>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeading
              index="01"
              eyebrow="The gap"
              title="A weekend token price is not Monday's stock price."
              lede="While US exchanges are closed, an rToken trades on indicative quotes. When the regular session opens, it re-anchors to the stock, and the gap can go either way. Three moments matter, and they are not the same moment."
            />
          </Reveal>
          <div className="mt-12">
            <SessionTimeline reopenCheck={p.session.reopenCheck} />
          </div>
          <Reveal className="mt-6">
            <div data-reveal>
              <CancellationRule rule={p.cancellation.rule} source={p.cancellation.source} scope={p.cancellation.scopeUnderlyings} />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Workflow */}
      <section className="border-y border-line bg-surface/60 py-20 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeading index="02" eyebrow="How the desk works" title="From a sentence to a decision you own." lede="Three steps, with your confirmation in the middle. The research never runs on fields you have not checked." />
          </Reveal>
          {e && (
            <div className="mt-12">
              <WorkflowDemo
                steps={WORKFLOW_STEPS}
                example={{
                  sentence,
                  baseCoin: e.baseCoin,
                  intentLabel: INTENT_LABEL[e.intention.intent],
                  holding: e.intention.holdingUsdt !== null ? `${fmtNum(e.intention.holdingUsdt, 0)} USDT` : "Not used",
                  trade: e.intention.tradeUsdt !== null ? `${fmtNum(e.intention.tradeUsdt, 0)} USDT` : e.intention.intent === "HOLD" ? "25% trim, modeled" : "n/a",
                  action: e.action === "STAND_DOWN" ? "STAND DOWN" : e.action,
                  reason: plainReason(e),
                }}
              />
            </div>
          )}
          <p className="mt-8">
            <Link href="/how-it-works" className="rounded text-sm font-semibold text-brand hover:text-brand-deep">
              See the full journey, step by step
            </Link>
          </p>
        </Container>
      </section>

      {/* Real replay */}
      {e && (
        <section id="replay" className="py-20 sm:py-28">
          <Container>
            <Reveal>
              <SectionHeading
                index="03"
                eyebrow="A real replay"
                title={
                  <>
                    {e.baseCoin}, the weekend after <span className="whitespace-nowrap">{fmtDay(e.lastTradingDay)}</span>.
                  </>
                }
                lede="Replayed as of Sunday 20:00 ET with only the data available then. The outcome below was revealed afterwards and was never used by the decision."
              />
            </Reveal>
            <Reveal className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div data-reveal className="min-w-0">
                <PriceSequence e={e} />
              </div>
              <div data-reveal className="space-y-4">
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">What this replay shows</h3>
                    <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-semibold tracking-wide text-mist">Decision: {ACTION_LABEL[e.action]}</span>
                  </div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
                    <li>
                      The weekend quote moved {fmtPct(e.move.w)} from Friday; an extreme move needed more than {fmtPct(e.move.threshold, 2, false)}.
                    </li>
                    <li>
                      {e.sample.matched} of {e.sample.eligible} eligible prior weekends matched; {e.sample.required} are required.{" "}
                      {e.action === "STAND_DOWN" ? "The desk stood down." : `The rules produced ${ACTION_LABEL[e.action]}.`}
                    </li>
                    <li>
                      The token then reopened {fmtPct(e.move.g)} from the Sunday quote and ended the first hour {fmtPct(e.move.r)} from it.
                    </li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-line bg-sunken/70 p-5">
                  <h3 className="text-base font-semibold">What it cannot show</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                    One weekend is not a forecast or a track record. It does not show that standing down was right, and fills at the quoted prices are assumed, not observed.
                  </p>
                </div>
              </div>
            </Reveal>
            <Reveal className="mt-6">
              <details data-reveal className="group rounded-2xl border border-line bg-surface">
                <summary className="flex min-h-14 items-center justify-between gap-4 rounded-2xl px-5 py-3 text-[15px] font-semibold text-ink">
                  Replay values, timestamps and sources
                  <ChevronDown aria-hidden className="chev h-5 w-5 text-ink-3 transition-transform" />
                </summary>
                <div className="space-y-4 border-t border-line px-5 py-5">
                  <div className="table-wrap" role="region" aria-label="Replay values" tabIndex={0}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Observation</th>
                          <th scope="col">Time (New York)</th>
                          <th scope="col">Value</th>
                          <th scope="col">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Friday reference (token)</td>
                          <td>{fmtEt(e.times.weekendStart)}</td>
                          <td>{fmtNum(e.prices.fridayRef, e.pricePrecision)} USDT</td>
                          <td className="wrap">Bitget 15m bar ending at the weekend start</td>
                        </tr>
                        <tr>
                          <td>Sunday decision quote (token)</td>
                          <td>{fmtEt(e.times.transition)}</td>
                          <td>{fmtNum(e.prices.decision, e.pricePrecision)} USDT</td>
                          <td className="wrap">Bitget 15m bar ending at the inferred transition</td>
                        </tr>
                        <tr>
                          <td>Monday reopening (token)</td>
                          <td>{fmtEt(e.times.reopen)}</td>
                          <td>{fmtNum(e.prices.reopen, e.pricePrecision)} USDT</td>
                          <td className="wrap">Open of the Bitget 15m bar starting at 09:30</td>
                        </tr>
                        <tr>
                          <td>First-hour end (token)</td>
                          <td>{fmtEt(e.times.endpoint)}</td>
                          <td>{fmtNum(e.prices.endpoint, e.pricePrecision)} USDT</td>
                          <td className="wrap">Close of the Bitget 15m bar ending at 10:30</td>
                        </tr>
                        <tr>
                          <td>{e.underlying} official close</td>
                          <td>{e.stock.fridayCloseDate ?? "n/a"}</td>
                          <td>{fmtNum(e.stock.fridayClose)} USD</td>
                          <td className="wrap">{e.stock.source ?? "n/a"}; kept separate from token prices</td>
                        </tr>
                        <tr>
                          <td>{e.underlying} official open</td>
                          <td>{e.stock.reopenOpenDate ?? "n/a"}</td>
                          <td>{fmtNum(e.stock.reopenOpen)} USD</td>
                          <td className="wrap">{e.stock.source ?? "n/a"}</td>
                        </tr>
                        <tr>
                          <td>Weekend turnover proxy (H_t)</td>
                          <td>Before the decision</td>
                          <td>{fmtNum(e.ht, 0)} USDT/h</td>
                          <td className="wrap">Median of the three prior weekend-session medians</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-ink-2">
                    Intent used: {e.intentionSource.toLowerCase()}. Data snapshot pulled {utc(p.snapshot.pulledAt)}; replays generated {utc(p.snapshot.evaluatedAt)}. Full method and receipts on the{" "}
                    <Link href="/method" className="rounded font-semibold text-brand hover:text-brand-deep">
                      method page
                    </Link>
                    .
                  </p>
                </div>
              </details>
            </Reveal>
          </Container>
        </section>
      )}

      <EvidenceMap p={p} />

      {/* Limitations */}
      <section className="py-20 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeading index="05" eyebrow="Limitations" title="What the evidence does not show yet." lede="These are part of the product, not fine print. Each one is derived from the current records." />
          </Reveal>
          <div className="mt-12">
            <Limitations p={p} />
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="pb-20 sm:pb-28">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <SectionHeading index="06" eyebrow="Questions" title="Plain answers." />
          </Reveal>
          <Faq />
        </Container>
      </section>

      <Container>
        <CtaBand title="Check the weekend before Monday does." body="Bring one intended trade. Leave with the evidence, the modeled size, the order rule and its open questions. The decision stays yours." />
      </Container>
    </>
  );
}
