import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

/** Indexing is allowed only when a validated public origin is configured (REANCHOR_SITE_URL); otherwise crawlers are asked to stay out. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${origin.origin}/sitemap.xml` };
}
