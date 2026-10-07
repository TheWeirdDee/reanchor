import { ImageResponse } from "next/og";

export const SOCIAL_SIZE = { width: 1200, height: 630 };
export const SOCIAL_ALT = "Reanchor: a weekend quote, a Monday decision";

/** Branded social card. Deliberately carries no counts, prices or performance figures, so it can never go stale. */
export function socialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "radial-gradient(circle at 85% 0%, #2c5560 0%, #183338 55%, #12282c 100%)",
          color: "#f6f4ef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f6f4ef", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#335c67" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3" />
              <path d="M12 22V8" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>Reanchor</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04 }}>A weekend quote.</div>
          <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04, color: "#c9d6d8" }}>A Monday decision.</div>
          <div style={{ marginTop: 28, fontSize: 28, color: "#9fb4b8", maxWidth: 900, lineHeight: 1.35 }}>
            Stress-test a weekend rToken trade against prior market reopenings, then decide yourself.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#9fb4b8", letterSpacing: 2, textTransform: "uppercase" }}>Research tool, not investment advice</div>
      </div>
    ),
    SOCIAL_SIZE,
  );
}
