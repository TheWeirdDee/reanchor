import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SITE_DESCRIPTION, SITE_NAME, SOCIAL_IMAGE, siteOrigin } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const origin = siteOrigin();

export const metadata: Metadata = {
  // Only a validated public https origin is used; without one, canonical URLs are omitted and pages are not indexed.
  metadataBase: origin ?? undefined,
  title: { default: "Reanchor: stress-test a weekend rToken trade", template: "%s | Reanchor" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, title: "Reanchor: stress-test a weekend rToken trade", description: SITE_DESCRIPTION, ...(origin ? { images: [SOCIAL_IMAGE] } : {}) },
  twitter: { card: "summary_large_image", title: "Reanchor: stress-test a weekend rToken trade", description: SITE_DESCRIPTION, ...(origin ? { images: [SOCIAL_IMAGE.url] } : {}) },
  robots: origin ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#183338" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-brand-deep px-4 py-2 text-sm font-semibold text-mist focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
