import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { ReactNode } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { getPresentation } from "@/server/presentation";
import { ACTION_LABEL, fmtNum, fmtPct } from "@/lib/format";
import { Container, Eyebrow } from "@/components/site/primitives";
import { HeroMotion, Reveal } from "@/components/motion/Motion";
import { plainReason, ReplayPreview } from "@/components/marketing/ReplayPreview";
import { ScenarioDemo } from "@/components/marketing/ScenarioDemo";
import { CtaBand } from "@/components/marketing/Sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: "How it works", description: "The full Reanchor journey: describe a weekend rToken trade, confirm the extracted fields, read the rule-based stress test, explore a hypothetical scenario and decide yourself.", path: "/how-it-works" });

function Step({ n, title, children, visual }: { n: string; title: string; children: ReactNode; visual: ReactNode }) {
  return (
    <Reveal as="section" aria-labelledby={`step-${n}`} className="relative grid gap-8 border-t border-line py-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div data-reveal className="lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-brand">Step {n}</p>
        <h2 id={`step-${n}`} className="display-md mt-3 text-ink">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-2">{children}</div>
      </div>
      <div data-reveal className="min-w-0">
        {visual}
      </div>
    </Reveal>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-brand-deep p-4 sm:p-6">
      <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}

export default function HowItWorks() {
  const p = getPresentation();
  const e = p.example;
  const a = p.assumptions;
  const holding = e?.intention.holdingUsdt ?? null;
  const sentence = e ? `I hold ${fmtNum(holding, 0)} USDT of ${e.baseCoin} and want to check whether to trim.` : "";

  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="on-dark texture-grain shade-radial relative overflow-hidden rounded-[var(--radius-frame)]">
          <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
          <HeroMotion className="relative">
            <Container className="py-14 sm:py-20">
              <div data-hero>
                <Eyebrow tone="dark">How it works</Eyebrow>
              </div>
              <h1 data-hero className="display-xl mt-5 max-w-[16ch] text-mist">
                Eight steps from a sentence to your decision.
              </h1>
              <p data-hero className="lede mt-6 max-w-2xl text-mist-2">
                Language goes in, a confirmed intention comes out, deterministic rules do the research, and you decide. The examples below use the real replay of {e?.baseCoin ?? "the supported rToken"}.
              </p>
            </Container>
          </HeroMotion>
        </div>
      </section>

      <Container className="py-10 sm:py-14">
        <Step
          n="1"
          title="Describe it in your own words"
          visual={
            <Frame>
              <div className="rounded-2xl bg-surface p-5">
                <p className="text-sm font-semibold">Describe your decision</p>
                <div className="mt-3 rounded-xl border border-line-strong bg-paper px-4 py-3 text-[15px]">{sentence}</div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-deep px-3.5 py-2 text-sm font-semibold text-mist">
                  <Sparkles aria-hidden className="h-4 w-4" /> Extract fields
                </div>
                <p className="mt-4 text-sm text-ink-3">
                  Model: {p.integrations.model.model}. {p.integrations.model.configured ? "Configured on this server." : "Not configured on this server; the form below always works."}
                </p>
              </div>
            </Frame>
          }
        >
          <p>Type the trade you are considering. The language model extracts only the instrument, the intent, sizes and a limit if you state one. Anything absent stays blank.</p>
          <p>A price you mention is treated as your proposal, never as market data, and instructions hidden in the text are ignored.</p>
        </Step>

        <Step
          n="2"
          title="Or use the structured form"
          visual={
            <Frame>
              <div className="grid gap-3 rounded-2xl bg-surface p-5 sm:grid-cols-2">
                <div className="rounded-xl border border-line p-3 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Instrument and intent</p>
                  <p className="mt-1 text-[15px] font-medium">
                    {e?.baseCoin ?? "rToken"} · Hold, check whether to trim
                  </p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Your position</p>
                  <p className="num mt-1 text-[15px] font-medium">Holding {fmtNum(holding, 0)} USDT</p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Proposed trade</p>
                  <p className="mt-1 text-[15px] font-medium">Trim of {fmtPct(a.holdTrimFraction, 0, false)} modeled</p>
                </div>
              </div>
            </Frame>
          }
        >
          <p>The form works without any model. It keeps your existing holding separate from the size of the trade you propose, because the rules treat them differently: you cannot sell more than you hold, and no shorting is modeled.</p>
          <p>Buying and selling need a limit price in USDT per token. Amounts are capped at {fmtNum(a.demoCapUsdt, 0)} USDT in this research desk.</p>
        </Step>

        <Step
          n="3"
          title="Confirm before anything runs"
          visual={
            <Frame>
              <div className="rounded-2xl bg-surface p-5">
                <div className="flex flex-wrap gap-2">
                  {["Instrument", "Intent", "Holding"].map((f) => (
                    <span key={f} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
                      {f}: from your text
                    </span>
                  ))}
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-mist">
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> Confirm intention
                </div>
                <p className="mt-3 text-sm text-ink-3">Editing any field clears the confirmation. The research button stays disabled until you confirm again.</p>
              </div>
            </Frame>
          }
        >
          <p>Extracted fields are marked so you can see what came from your text. You can change any of them. Research runs only on the intention you confirm.</p>
        </Step>

        <Step
          n="4"
          title="Your intent limits which actions are possible"
          visual={
            <div className="table-wrap" role="region" aria-label="Intent to action mapping" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Intent</th>
                    <th scope="col">Only acts when</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Hold</td>
                    <td className="wrap">An extreme weekend rise that prior weekends reversed</td>
                    <td className="wrap">TRIM: model selling up to {fmtPct(a.holdTrimFraction, 0, false)} of the holding</td>
                  </tr>
                  <tr>
                    <td>Buy the dip</td>
                    <td className="wrap">An extreme weekend fall that prior weekends reversed</td>
                    <td className="wrap">FADE: model a spot buy</td>
                  </tr>
                  <tr>
                    <td>Sell into a pop</td>
                    <td className="wrap">An extreme weekend rise that prior weekends reversed, with enough holdings</td>
                    <td className="wrap">FADE: model a sale of tokens you hold</td>
                  </tr>
                  <tr>
                    <td>Any intent</td>
                    <td className="wrap">Anything else, or any failed check</td>
                    <td className="wrap">STAND DOWN, with the reason</td>
                  </tr>
                </tbody>
              </table>
            </div>
          }
        >
          <p>Deterministic rules choose the action. They first check the session, data freshness, turnover, sample size, holdings and the order band; any failure means STAND DOWN with the reason shown.</p>
          <p>
            A move counts as extreme beyond the {Math.round(a.extremePercentile * 100)}th percentile of at least {a.minEligible} prior weekends, and at least {a.minMatched} comparable extreme weekends must have reversed.
          </p>
        </Step>

        <Step n="5" title="Stress test against prior reopenings" visual={e ? <ReplayPreview e={e} sourcesHref="/method#evaluation" /> : <p>No replay available.</p>}>
          <p>Only weekends whose first regular-session hour ended before the decision are compared. The weekend being decided, and anything after it, is never visible to the rules.</p>
          {e && (
            <p>
              In this replay {e.sample.eligible} prior weekends were eligible, {e.sample.excluded} were excluded with reasons, and {e.sample.matched} matched the move, against {e.sample.required} required.{" "}
              {e.action === "STAND_DOWN" ? `The desk stood down: ${plainReason(e)}` : `The rules produced ${ACTION_LABEL[e.action]}.`}
            </p>
          )}
        </Step>

        <Step
          n="6"
          title="Size against weekend activity, with modeled costs"
          visual={
            e ? (
              <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                {[
                  ["Intended clip", `${fmtNum(e.sizing.proposedClipUsdt)} USDT`, `${fmtPct(a.holdTrimFraction, 0, false)} of the ${fmtNum(holding, 0)} USDT holding`],
                  ["Weekend turnover proxy (H_t)", `${fmtNum(e.ht, 0)} USDT/h`, "Median of the last three weekend-session medians"],
                  ["Participation", fmtPct(e.sizing.participation, 1, false), `Hard limit ${fmtPct(a.hardParticipation, 0, false)}; modeled cap ${fmtPct(a.modeledCap, 0, false)}`],
                  ["Capacity after the cap", `${fmtNum(e.sizing.capacityUsdt)} USDT`, e.sizing.reductionReasons[0] ?? "No reduction"],
                  ["Fee assumption", `${(a.feeRate * 100).toFixed(2)}% per fill`, "Assumed, not measured"],
                  ["Slippage assumption", a.slippageTiers.map((t) => `${t.bps} bps up to ${fmtPct(t.maxParticipation, 0, false)}`).join(", "), "No modeled fill above the cap"],
                ].map(([k, v, n]) => (
                  <div key={k} className="bg-surface p-4">
                    <dt className="text-xs font-medium uppercase tracking-[0.08em] text-ink-3">{k}</dt>
                    <dd className="num mt-1 text-lg font-semibold text-ink">{v}</dd>
                    <dd className="mt-0.5 text-xs text-ink-3">{n}</dd>
                  </div>
                ))}
              </dl>
            ) : null
          }
        >
          <p>The size you propose is compared with recent weekend activity on Bitget. Turnover is an activity proxy, not order-book depth, so these are planning numbers, not executable guarantees.</p>
          <p>When the action is STAND DOWN no clip is proposed; the capacity figure only shows how the rule would have sized it.</p>
        </Step>

        <Step
          n="7"
          title="Explore a scenario without changing the evidence"
          visual={
            e ? (
              <ScenarioDemo
                underlying={e.underlying}
                fridayClose={e.stock.fridayClose}
                decisionPrice={e.prices.decision}
                basis={e.basis}
                holdingUsdt={holding}
                action={e.action === "STAND_DOWN" ? "STAND DOWN" : e.action}
                pricePrecision={e.pricePrecision}
              />
            ) : null
          }
        >
          <p>Move the slider to imagine where the underlying stock might reopen. The token value follows through an editable basis assumption, here the median gap observed between the token and the official open on earlier weekends.</p>
          <p>The scenario is hypothetical. It never changes the historical comparison or the computed action, and it is not a probability.</p>
        </Step>

        <Step
          n="8"
          title="You decide"
          visual={
            <Frame>
              <div className="rounded-2xl bg-surface p-5">
                <p className="text-sm font-semibold">What the desk will not do</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-ink-2">
                  <li>Place, route or sign an order</li>
                  <li>Connect to an account</li>
                  <li>Promise a fill or a cancellation deadline</li>
                  <li>Tell you a held position is safe</li>
                </ul>
              </div>
            </Frame>
          }
        >
          <p>The card gives one action, its reason, the modeled size, Bitget&apos;s weekend order rule with its timing marked unverified, sources and limitations. What you do with it is your decision.</p>
        </Step>
      </Container>

      <Container>
        <CtaBand title="Try it on your own weekend trade." body="The desk runs live during the weekend session and replays any completed weekend at other times." />
      </Container>
    </>
  );
}
