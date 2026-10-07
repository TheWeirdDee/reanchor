import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

/** Technical bracket label, e.g. "[ 02 ] Sessions". */
export function Eyebrow({ index, children, tone = "light" }: { index?: string; children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.16em] ${tone === "dark" ? "text-mist-3" : "text-ink-3"}`}>
      {index && <span className={tone === "dark" ? "text-vanilla" : "text-brand"}>[ {index} ] </span>}
      {children}
    </p>
  );
}

export function SectionHeading({ index, eyebrow, title, lede, tone = "light", align = "left" }: { index?: string; eyebrow: string; title: ReactNode; lede?: ReactNode; tone?: "light" | "dark"; align?: "left" | "center" }) {
  return (
    <div className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <div data-reveal>
        <Eyebrow index={index} tone={tone}>
          {eyebrow}
        </Eyebrow>
      </div>
      <h2 data-reveal className={`display-lg mt-4 ${tone === "dark" ? "text-mist" : "text-ink"}`}>
        {title}
      </h2>
      {lede && (
        <p data-reveal className={`lede mt-4 ${tone === "dark" ? "text-mist-2" : "text-ink-2"}`}>
          {lede}
        </p>
      )}
    </div>
  );
}

const BTN = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors";

export function ButtonLink({ href, children, variant = "primary", tone = "light", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary"; tone?: "light" | "dark"; className?: string }) {
  const style =
    variant === "primary"
      ? tone === "dark"
        ? "bg-mist text-brand-deep hover:bg-vanilla"
        : "bg-brand-deep text-mist hover:bg-brand"
      : tone === "dark"
        ? "border border-white/25 text-mist hover:border-white/50 hover:bg-white/5"
        : "border border-line-strong bg-surface text-ink hover:border-brand";
  return (
    <Link href={href} className={`${BTN} ${style} ${className}`}>
      {children}
      {variant === "primary" && <ArrowRight aria-hidden className="h-4 w-4" />}
    </Link>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral" | "dark"; children: ReactNode }) {
  const cls = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    neutral: "bg-sunken text-ink-2",
    dark: "bg-white/10 text-mist",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}
