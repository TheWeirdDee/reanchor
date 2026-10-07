/**
 * Reanchor mark: a ring (the reference price) with a vertical shank and a curved base that re-anchors to a line.
 * Drawn on a 24px grid with whole-pixel strokes so it stays crisp at small sizes.
 */
export function LogoMark({ className = "h-7 w-7", tone = "slate" }: { className?: string; tone?: "slate" | "light" }) {
  const fg = tone === "slate" ? "var(--color-brand)" : "var(--color-mist)";
  const bg = tone === "slate" ? "var(--color-brand-soft)" : "rgb(246 244 239 / 0.1)";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <rect x="0.5" y="0.5" width="23" height="23" rx="7" fill={bg} stroke={fg} strokeOpacity="0.25" />
      <circle cx="12" cy="6.75" r="2" fill="none" stroke={fg} strokeWidth="1.6" />
      <path d="M12 8.75V18.5" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.25 13.25c0.4 3 2.9 5.25 5.75 5.25s5.35-2.25 5.75-5.25" fill="none" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 11.25h6" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ tone = "slate" }: { tone?: "slate" | "light" }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark tone={tone} />
      <span className={`text-[17px] font-semibold tracking-[-0.02em] ${tone === "slate" ? "text-ink" : "text-mist"}`}>Reanchor</span>
    </span>
  );
}
