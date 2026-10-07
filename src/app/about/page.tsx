import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { Compass, ShieldCheck, Target, Telescope } from "lucide-react";
import { getPresentation } from "@/server/presentation";
import { fmtDay, fmtNum } from "@/lib/format";
import { Container, Eyebrow, SectionHeading } from "@/components/site/primitives";
import { HeroMotion, Reveal } from "@/components/motion/Motion";
import { CtaBand } from "@/components/marketing/Sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: "About", description: "Who Reanchor serves, the weekend decision it helps with, the boundaries of what it does, and its current research stage.", path: "/about" });

export default function About() {
  const p = getPresentation();
  const v = p.validation;
  const a = p.assumptions;
  const blocks = [
    {
      icon: Target,
      title: "Who it is for",
      body: `Someone who holds or wants to buy a Bitget rToken, trades a few times a month, and cannot watch the next US open. This is a product hypothesis about who benefits, not a count of users. Amounts are capped at ${fmtNum(a.demoCapUsdt, 0)} USDT in this research desk.`,
    },
    {
      icon: Compass,
      title: "The decision it helps with",
      body: "One weekend question: should I trim, buy or sell this rToken now, and how much? The desk answers with one rule-based action, the largest modeled size, Bitget's weekend order rule, and the evidence and gaps behind them.",
    },
    {
      icon: ShieldCheck,
      title: "What it will not do",
      body: "It sends no orders, connects to no account and holds no keys. It does not forecast, does not promise fills or a cancellation deadline, and does not call a kept position safe. The decision stays with you.",
    },
    {
      icon: Telescope,
      title: "Where the research stands",
      body: `${p.coverage.supported.length} of ${p.coverage.candidates} candidate rTokens have enough weekend history. ${v.evaluatedWeekends} weekends have been evaluated chronologically, below the ${v.headlineMinEvaluations} needed for any headline rate, and none of the ${v.replayRows} replay rows produced FADE or TRIM. No user study has been run yet.`,
    },
  ];
  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="on-dark texture-grain shade-radial relative overflow-hidden rounded-[var(--radius-frame)]">
          <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
          <HeroMotion className="relative">
            <Container className="py-14 sm:py-20">
              <div data-hero>
                <Eyebrow tone="dark">About Reanchor</Eyebrow>
              </div>
              <h1 data-hero className="display-xl mt-5 max-w-[14ch] text-mist">
                A research desk for one weekend decision.
              </h1>
              <p data-hero className="lede mt-6 max-w-2xl text-mist-2">
                Weekend rToken prices move while the stock market is shut. Reanchor checks one intended trade against what happened at prior reopenings, and shows its working, including what it does not yet know.
              </p>
            </Container>
          </HeroMotion>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <Reveal className="grid gap-4 md:grid-cols-2">
            {blocks.map((b) => (
              <article key={b.title} data-reveal className="rounded-[24px] border border-line bg-surface p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
                  <b.icon aria-hidden className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">{b.title}</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{b.body}</p>
              </article>
            ))}
          </Reveal>
        </Container>
      </section>

      <section className="border-y border-line bg-surface/60 py-20 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <SectionHeading eyebrow="Research stage" title="Honest about a small sample." />
          </Reveal>
          <Reveal className="space-y-4 text-[16px] leading-relaxed text-ink-2">
            <p data-reveal>
              The current dataset was pulled {p.snapshot.pulledAt ? `${p.snapshot.pulledAt.slice(0, 10)}` : "n/a"}. Weekend trading on these rTokens is recent: the first weekend with every boundary price present is {fmtDay(p.coverage.firstBoundaryCompleteWeekend)}. That limits how much history any comparison can draw on.
            </p>
            <p data-reveal>
              The rules were fixed before the evaluation was run and were not tuned to produce a trade. The evidence so far does not establish a trading edge, and Reanchor does not claim one. More weekends will make the comparison more informative; they will not be invented.
            </p>
            <p data-reveal>Every count, status and date on this site is read from the saved records, and the method page shows each weekend that was checked.</p>
          </Reveal>
        </Container>
      </section>

      <Container className="mt-20">
        <CtaBand title="See it on a real weekend." body="Open the desk to replay a completed weekend now, or run a live check during the weekend session." />
      </Container>
    </>
  );
}
