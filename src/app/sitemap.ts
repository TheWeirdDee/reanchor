import type { MetadataRoute } from "next";
import { NAV, siteOrigin } from "@/lib/site";

/** Empty unless a validated public origin is configured; no localhost or invented URL is ever emitted. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  if (!origin) return [];
  return ["/", ...NAV.map((n) => n.href)].map((path) => ({ url: `${origin.origin}${path === "/" ? "" : path}` }));
}
