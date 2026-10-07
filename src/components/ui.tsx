import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 border-line",
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-bad-soft text-bad border-bad/30",
  accent: "bg-brand-soft text-brand-deep border-brand/25",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}

export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm ${toneClass[tone]}`}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={`${title ? "mt-1" : ""} text-ink-2`}>{children}</div>}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  id,
  actions,
  step,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  actions?: ReactNode;
  step?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="rounded-[22px] border border-line bg-surface p-5 shadow-[0_1px_0_rgba(23,44,49,0.03)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {step && <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{step}</p>}
          <h2 id={id ? `${id}-h` : undefined} className="text-lg font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Fact({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-paper/60 px-3 py-2.5 sm:px-3.5 sm:py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1 break-words text-sm font-semibold text-ink sm:text-[15px]">{value}</dd>
      {note && <dd className="mt-1 text-xs leading-snug text-ink-3">{note}</dd>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-3">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />
      {label}
    </span>
  );
}

export const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";
