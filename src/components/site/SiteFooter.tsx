import Link from "next/link";
import { NAV, SITE_DESCRIPTION } from "@/lib/site";
import { Wordmark } from "./Logo";

const EVIDENCE_LINKS = [
  { href: "/method#coverage", label: "Coverage" },
  { href: "/method#sessions", label: "Sessions and calendar" },
  { href: "/method#evaluation", label: "Chronological evaluation" },
  { href: "/method#integrations", label: "Integration status" },
  { href: "/method#assumptions", label: "Assumptions and limitations" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark relative mt-24 overflow-hidden bg-brand-deep text-mist-2">
      <div aria-hidden className="texture-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid max-w-[1280px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <Link href="/" aria-label="Reanchor home" className="inline-block rounded-lg">
            <Wordmark tone="light" />
          </Link>
          <p className="mt-4 text-sm leading-relaxed">{SITE_DESCRIPTION}</p>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            Reanchor sends no orders and connects to no account. You make the final decision.
          </p>
        </div>
        <nav aria-label="Product">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-mist-3">Product</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded transition-colors hover:text-mist">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Evidence">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-mist-3">Method and evidence</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {EVIDENCE_LINKS.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded transition-colors hover:text-mist">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-5 text-xs text-mist-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>&copy; {year} Reanchor. Research tool, not investment advice.</p>
          <p>Weekend rToken prices are indicative Bitget quotes, not Nasdaq or NYSE transactions.</p>
        </div>
      </div>
    </footer>
  );
}
