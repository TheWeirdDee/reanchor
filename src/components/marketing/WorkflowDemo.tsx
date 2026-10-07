"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, MessageSquareText, ListChecks, Scale } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export interface WorkflowExample {
  sentence: string;
  baseCoin: string;
  intentLabel: string;
  holding: string;
  trade: string;
  action: string;
  reason: string;
}

const STEPS = [
  { key: "describe", label: "Describe", icon: MessageSquareText },
  { key: "confirm", label: "Confirm", icon: ListChecks },
  { key: "decide", label: "Review and decide", icon: Scale },
] as const;

/**
 * Interactive illustration of the three-step journey. The values are the real replay example's confirmed inputs
 * and computed result, passed from the server; nothing here is computed on the client.
 */
export function WorkflowDemo({ steps, example }: { steps: readonly { n: string; title: string; body: string }[]; example: WorkflowExample }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-panel-item]", { opacity: 0, y: 10, duration: 0.35, stagger: 0.05, ease: "power2.out", clearProps: "opacity,transform" });
      });
      return () => mm.revert();
    },
    { dependencies: [active], scope: panelRef, revertOnUpdate: true },
  );

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % STEPS.length : e.key === "ArrowLeft" ? (i + STEPS.length - 1) % STEPS.length : e.key === "Home" ? 0 : e.key === "End" ? STEPS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    setActive(n);
    tabs.current[n]?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <div role="tablist" aria-label="How the desk works" aria-orientation="vertical" className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const Icon = STEPS[i].icon;
          const selected = i === active;
          return (
            <button
              key={s.n}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`group rounded-2xl border p-5 text-left transition-colors ${selected ? "border-brand/40 bg-surface shadow-[0_12px_40px_-24px_rgb(24_51_56/0.5)]" : "border-line bg-transparent hover:bg-surface/60"}`}
            >
              <div className="flex items-start gap-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-brand-deep text-mist" : "bg-sunken text-ink-2"}`}>
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span>
                  <span className="font-mono text-xs text-ink-3">{s.n}</span>
                  <span className="mt-0.5 block text-lg font-semibold tracking-tight text-ink">{s.title}</span>
                  <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-2">{s.body}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div ref={panelRef} role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} className="relative overflow-hidden rounded-[24px] bg-brand-deep p-5 sm:p-7">
        <div aria-hidden className="texture-grid pointer-events-none absolute inset-0" />
        <div className="relative rounded-2xl bg-surface p-5 sm:p-6">
          {active === 0 && (
            <div>
              <p data-panel-item className="text-sm font-semibold text-ink">1. Describe your decision</p>
              <div data-panel-item className="mt-3 rounded-xl border border-line-strong bg-paper px-4 py-3 text-[15px] text-ink">
                {example.sentence}
              </div>
              <div data-panel-item className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-brand-deep px-3 py-1.5 font-semibold text-mist">Extract fields</span>
                <span className="rounded-full border border-line px-3 py-1.5 text-ink-2">or use the form</span>
              </div>
              <p data-panel-item className="mt-4 text-sm text-ink-3">Numbers you type are your proposal. The model never treats them as market prices.</p>
            </div>
          )}
          {active === 1 && (
            <div>
              <p data-panel-item className="text-sm font-semibold text-ink">2. Confirm the structured intention</p>
              <dl data-panel-item className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Instrument", example.baseCoin],
                  ["Intent", example.intentLabel],
                  ["Existing holding", example.holding],
                  ["Proposed trade", example.trade],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line px-3 py-2.5">
                    <dt className="text-xs text-ink-3">{k}</dt>
                    <dd className="num mt-0.5 font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div data-panel-item className="mt-4 inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1.5 text-sm font-semibold text-ok">
                <CheckCircle2 aria-hidden className="h-4 w-4" /> Confirmed. Research runs only now.
              </div>
            </div>
          )}
          {active === 2 && (
            <div>
              <p data-panel-item className="text-sm font-semibold text-ink">3. Review the stress test</p>
              <div data-panel-item className="mt-3 rounded-xl border border-brand/20 bg-brand-soft/60 p-4">
                <p className="text-xl font-semibold tracking-tight text-brand-deep">{example.action}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{example.reason}</p>
              </div>
              <ul data-panel-item className="mt-4 space-y-1.5 text-sm text-ink-2">
                <li>Prior reopenings, modeled size and costs</li>
                <li>Bitget&apos;s weekend order rule, timing not verified</li>
                <li>Sources, timestamps and limitations</li>
              </ul>
              <p data-panel-item className="mt-4 text-sm font-semibold text-ink">You decide. No order is sent.</p>
            </div>
          )}
        </div>
        <p className="relative mt-4 text-xs text-mist-3">Values from the real replay shown above; the sentence is an example input.</p>
      </div>
    </div>
  );
}
