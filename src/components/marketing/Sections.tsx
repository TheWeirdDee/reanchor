import { ChevronDown, Cpu, Database, FileWarning, Radio, Sparkles } from "lucide-react";
import type { Presentation } from "@/server/presentation";
import { FAQ } from "@/lib/site";
import { Reveal } from "@/components/motion/Motion";
import { ButtonLink, Container, Eyebrow, StatusPill } from "@/components/site/primitives";

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "n/a");

/** Sources feed one rule-based engine; the model only parses and explains. Status values come from the records. */
export function EvidenceMap({ p }: { p: Presentation }) {
  const i = p.integrations;
  const sources = [
    {
      icon: Radio,
      title: "Bitget Agent Hub market data",
      role: "Live 15-minute rToken candles for the decision price, through Bitget's official read-only Agent Hub MCP.",
      status: i.agentHub.status === "WORKING" ? `Working: ${i.agentHub.okCalls}/${i.agentHub.calls} calls match the dataset` : "Not working",
      tone: i.agentHub.status === "WORKING" ? ("ok" as const) : ("bad" as const),
      note: `Last checked ${fmtDate(i.agentHub.lastRunAt)}. Market data only: no corporate actions, earnings, calendar or stock prices.`,
    },
    {
      icon: Database,
      title: "Historical observations",
      role: "Saved Bitget 15-minute history replayed chronologically, using only weekends completed before each decision.",
      status: `${p.validation.uniqueWeekends} weekends, ${p.validation.evaluatedWeekends} evaluated`,
      tone: "neutral" as const,
      note: `Snapshot pulled ${fmtDate(p.snapshot.pulledAt)}.`,
    },
    {
      icon: FileWarning,
      title: "Corporate actions",
      role: "Splits and ex-dividend dates that would distort a reopening comparison are excluded.",
      status: i.corporateActions.source === "BITGET_AI_MCP" ? "Bitget AI data MCP" : i.corporateActions.source === "FALLBACK" ? "Labeled fallback in use" : "Unavailable",
      tone: i.corporateActions.source === "BITGET_AI_MCP" ? ("ok" as const) : ("warn" as const),
      note: `${i.corporateActions.label}. Bitget AI data MCP: ${i.dataMcp.outcome} (last checked ${fmtDate(i.dataMcp.lastCheckedAt)}). Earnings dates: ${i.earnings.available ? "available" : "unavailable"}.`,
    },
    {
      icon: Sparkles,
      title: `Language model (${i.model.model})`,
      role: "Turns your sentence into editable fields and explains results that were already computed. It cannot change the action or the size.",
      status: !i.model.configured ? "Not configured on this server" : i.model.realCallOk ? "Configured, verified with a real call" : `Configured, ${i.model.verification?.toLowerCase() ?? "unverified"}`,
      tone: i.model.configured && i.model.realCallOk ? ("ok" as const) : ("warn" as const),
      note: "Explanations whose numbers or action do not match the card are discarded and replaced with a fallback.",
    },
  ];
  return (
    <section className="on-dark relative overflow-hidden bg-brand-deep py-20 text-mist sm:py-24">
      <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_85%_0%,rgb(51_92_103/0.55),transparent_70%)]" />
      <Container className="relative">
        <Reveal>
          <div data-reveal>
            <Eyebrow index="04" tone="dark">
              Evidence
            </Eyebrow>
          </div>
          <h2 data-reveal className="display-lg mt-4 max-w-3xl text-mist">
            Four sources, one rule-based engine, one decision that stays yours.
          </h2>
          <p data-reveal className="lede mt-4 max-w-2xl text-mist-2">
            Each source has a defined job and a visible status. When one is unavailable, the desk says so and uses a labeled fallback or stands down.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {sources.map((s) => (
              <div key={s.title} data-reveal className="rounded-2xl border border-white/12 bg-white/[0.04] p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-mist">
                    <s.icon aria-hidden className="h-5 w-5" />
                  </span>
                  <StatusPill tone={s.tone}>{s.status}</StatusPill>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-mist">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist-2">{s.role}</p>
                <p className="mt-3 text-xs leading-relaxed text-mist-3">{s.note}</p>
              </div>
            ))}
          </div>
          <div data-reveal className="mt-6 flex items-center gap-4 rounded-2xl border border-white/12 bg-white/[0.04] p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vanilla text-brand-deep">
              <Cpu aria-hidden className="h-5 w-5" />
            </span>
            <p className="text-[15px] leading-relaxed text-mist-2">
              <span className="font-semibold text-mist">Rule-based engine.</span> Cohorts, thresholds, sizing, costs and the action are computed by deterministic code. Removing the model leaves every number and action unchanged.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export function Limitations({ p }: { p: Presentation }) {
  const v = p.validation;
  const items = [
    { title: "Narrow coverage", body: `${p.coverage.supported.length} of ${p.coverage.candidates} candidate rTokens (${p.coverage.supported.map((s) => s.baseCoin).join(", ") || "none"}) have enough weekend history. The others are listed with their reasons on the method page.` },
    { title: "Small evaluation", body: `${v.evaluatedWeekends} weekends have been evaluated chronologically. A headline rate would need at least ${v.headlineMinEvaluations}, so results are exploratory.` },
    { title: "No FADE or TRIM yet", body: `${v.actionRows === 0 ? "None" : v.actionRows} of the ${v.replayRows} replay rows (${v.uniqueWeekends} weekends x ${v.intents} intents) produced a trade suggestion. The evidence does not establish a trading edge.` },
    { title: "Cancellation timing", body: "Bitget documents that unfilled weekend limits are cancelled at the switch back to regular trading, but not when. Reanchor shows the rule and no deadline." },
    {
      title: "Modeled costs and fills",
      body: `Fees (${(p.assumptions.feeRate * 100).toFixed(2)}% per fill) and slippage (${p.assumptions.slippageTiers.map((t) => `${t.bps} bps`).join(" or ")}) are assumptions. Comparisons assume fills at observed quotes; whether a limit would have filled is unknown.`,
    },
    {
      title: "Source gaps",
      body: `Corporate actions use ${p.integrations.corporateActions.source === "FALLBACK" ? "a labeled fallback" : "the Bitget AI data MCP"}; earnings dates are ${p.integrations.earnings.available ? "available" : "unavailable"}. Weekend trading is sparse, so live checks often stand down on stale prices.`,
    },
  ];
  return (
    <Reveal className="grid gap-px overflow-hidden rounded-[24px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} data-reveal className="bg-surface p-6">
          <h3 className="text-base font-semibold tracking-tight text-ink">{it.title}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{it.body}</p>
        </div>
      ))}
    </Reveal>
  );
}

export function Faq() {
  return (
    <Reveal className="divide-y divide-line rounded-[24px] border border-line bg-surface">
      {FAQ.map((f) => (
        <details key={f.q} data-reveal className="group px-6 py-1">
          <summary className="flex min-h-14 items-center justify-between gap-4 py-3 text-left text-base font-semibold text-ink">
            {f.q}
            <ChevronDown aria-hidden className="chev h-5 w-5 shrink-0 text-ink-3 transition-transform" />
          </summary>
          <p className="pb-5 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
        </details>
      ))}
    </Reveal>
  );
}

export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <div className="on-dark texture-grain relative overflow-hidden rounded-[var(--radius-frame)] shade-radial px-6 py-14 text-center sm:px-12">
      <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
      <Reveal className="relative mx-auto max-w-2xl">
        <h2 data-reveal className="display-lg text-mist">
          {title}
        </h2>
        <p data-reveal className="lede mt-4 text-mist-2">
          {body}
        </p>
        <div data-reveal className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/desk" tone="dark">
            Open desk
          </ButtonLink>
          <ButtonLink href="/method" tone="dark" variant="secondary">
            Read the method
          </ButtonLink>
        </div>
      </Reveal>
    </div>
  );
}
