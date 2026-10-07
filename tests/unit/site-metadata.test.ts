import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata, siteOrigin } from "@/lib/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("site origin gating", () => {
  it("rejects missing, http, localhost and malformed origins", () => {
    for (const v of ["", "http://example.org", "https://localhost:3000", "https://127.0.0.1", "not a url"]) {
      vi.stubEnv("REANCHOR_SITE_URL", v);
      expect(siteOrigin(), v).toBeNull();
    }
  });

  it("without an origin: no canonical, no social image URL, crawlers disallowed, empty sitemap", () => {
    vi.stubEnv("REANCHOR_SITE_URL", "");
    const m = pageMetadata({ title: "About", description: "d", path: "/about" });
    expect(m.alternates).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/localhost|social-card|"url"/);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(robots().sitemap).toBeUndefined();
    expect(sitemap()).toEqual([]);
  });

  it("with a validated origin: canonical, social image and sitemap entries for every public page", () => {
    vi.stubEnv("REANCHOR_SITE_URL", "https://reanchor.example.org/some/path");
    expect(siteOrigin()?.origin).toBe("https://reanchor.example.org");
    const m = pageMetadata({ title: "About", description: "d", path: "/about" });
    expect(m.alternates?.canonical).toBe("/about");
    expect(JSON.stringify(m.openGraph)).toContain("/social-card");
    expect(robots().sitemap).toBe("https://reanchor.example.org/sitemap.xml");
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://reanchor.example.org",
      "https://reanchor.example.org/desk",
      "https://reanchor.example.org/how-it-works",
      "https://reanchor.example.org/method",
      "https://reanchor.example.org/about",
    ]);
  });
});
