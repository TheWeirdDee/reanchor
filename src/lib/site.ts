import type { Metadata } from "next";
/**
 * Shared site configuration and copy. Pages import from here so navigation, workflow steps and FAQ answers
 * cannot drift apart. Numbers and statuses are NOT stored here: they come from the server presentation model.
 */
export const SITE_NAME = "Reanchor";
export const SITE_DESCRIPTION =
  "Stress-test a weekend rToken trade against prior market reopenings, check modeled size and the weekend order rule, then decide yourself.";

export const NAV = [
  { href: "/desk", label: "Desk" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/method", label: "Method & evidence" },
  { href: "/about", label: "About" },
] as const;

/**
 * Public origin for canonical URLs and the sitemap. Read from REANCHOR_SITE_URL and accepted only when it is an
 * absolute https URL that is not localhost. Without it, canonical links and sitemap entries are omitted.
 */
export function siteOrigin(): URL | null {
  const raw = process.env.REANCHOR_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname)) return null;
    return new URL(u.origin);
  } catch {
    return null;
  }
}

export const WORKFLOW_STEPS = [
  {
    n: "01",
    title: "Describe the intended trade",
    body: "Type it in your own words or fill the form: hold and consider a trim, buy a weekend dip, or sell held tokens into a weekend rise. Prices you mention are your proposal, never market data.",
  },
  {
    n: "02",
    title: "Confirm what was extracted",
    body: "Instrument, intent, holding size and trade size appear as editable fields. Holding and trade size stay separate. Nothing runs until you confirm.",
  },
  {
    n: "03",
    title: "Review the stress test and decide",
    body: "One rule-based action with its reason, prior reopenings, modeled size against weekend activity, the order rule, sources and limitations. You decide; no order is sent.",
  },
] as const;

export const FAQ = [
  {
    q: "Does Reanchor place trades?",
    a: "No. It sends no orders and connects to no account. It returns one rule-based action, TRIM, FADE or STAND DOWN, and the decision stays with you.",
  },
  {
    q: "Why can a weekend token price differ from Monday's stock price?",
    a: "Weekend rToken prices are indicative Bitget quotes made while US exchanges are closed. When the regular session opens, the token re-anchors to the stock, and it can gap in either direction.",
  },
  {
    q: "What does STAND DOWN mean?",
    a: "No trade is proposed, and the card says why. It does not mean the position is safe: a holding you keep stays exposed to the reopening.",
  },
  {
    q: "When does Bitget cancel an unfilled weekend limit order?",
    a: "Bitget documents that unfilled weekend limits are cancelled when trading switches back to the regular session on Monday's US open. It does not publish an exact timestamp, so Reanchor shows the rule and marks the timing as not verified.",
  },
  {
    q: "What does the language model do?",
    a: "It turns your sentence into editable fields and writes a short explanation of results that were already computed. It cannot change the action or the size, and an explanation whose numbers do not match the card is discarded.",
  },
  {
    q: "Is there evidence that fading weekend moves is profitable?",
    a: "No. The chronological evaluation is small and has not produced a single FADE or TRIM on real data. Reanchor reports that as it is, and the method page shows every weekend it checked.",
  },
] as const;

/**
 * Per-page metadata. Page-level openGraph/twitter objects replace the layout's, so every page sets the full set here.
 * Canonical and og:url are included only when a validated origin exists, so no localhost URL is ever emitted.
 */
/** Social card route; only referenced when an origin exists, because crawlers need an absolute URL. */
export const SOCIAL_IMAGE = { url: "/social-card", width: 1200, height: 630, alt: "Reanchor: a weekend quote, a Monday decision" };

export function pageMetadata({ title, description, path, absoluteTitle = false }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const origin = siteOrigin();
  const social = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title: social, description, ...(origin ? { url: path, images: [SOCIAL_IMAGE] } : {}) },
    twitter: { card: "summary_large_image", title: social, description, ...(origin ? { images: [SOCIAL_IMAGE.url] } : {}) },
    ...(origin ? { alternates: { canonical: path } } : {}),
  };
}
