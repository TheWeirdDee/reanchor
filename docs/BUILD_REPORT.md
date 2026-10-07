# Build report

Build window: 2026-10-02 to 2026-10-03. Workspace started empty except `reanchor-prd.md`, which was copied to `docs/PRD.md`. The build ran without version control; the audited tree was later committed to `github.com/TheWeirdDee/reanchor`, one file per commit, after a secret scan.

## Delivered

- **Next.js 16 App Router app.**
  - Pages: landing (`/`), desk (`/desk`), method and evidence (`/method`).
  - API routes: `/api/meta`, `/api/parse`, `/api/research`, `/api/explain`.
- **Domain engine** (`src/domain`, pure functions):
  - calendar, candles, episodes, the H_t turnover denominator, signal, intent mapping, sizing and band, accounting, scenario.
- **Server adapters** (`src/server`):
  - Bitget v3 market data and Reality endpoints, Nasdaq.com anchors and dividends, Bitget split records;
  - the read-only Bitget AI MCP client (official SDK, allowlist, circuit breaker);
  - the Gemini model adapter (`gemini-3.5-flash-lite`, configurable provider) with grounding validation;
  - live gathering with caches, a DNS fallback and timeouts.
- **Pipeline** (`scripts/`): discover, ingest (staged and atomic, preserving a valid snapshot), MCP-only refresh, validate, replay, verify.
- **Data** (`data/`): verified snapshot, manifest with hashes, weekends, evaluations and tool receipts. Raw responses in `data/raw/` (git-ignored).
- **Tests:** 84 Vitest tests (domain, adapters, model validation, provider configuration, Gemini rate limits, site-origin gating) and 49 Playwright checks across three widths, including the natural-language flow.
- **Documentation:** README, METHOD, DATA_GATE, CLAIM_LEDGER, VALIDATION, SUBMISSION, GATES.

## Notable findings during the build

1. Weekend rToken trading on Bitget is sparse. There are no weekend-book bars before late June 2026, and gaps of tens of minutes are common, so live decisions frequently fail the 45-minute freshness rule.
2. Weekend-only quotes end at an observed transition at Sunday 20:00 ET (inferred from Bitget calendar windows, states and candles). This is not a verified cancellation time; the G2/G3 audit removed the earlier definitive Sunday cancellation claim.
3. Bitget's `daylightType` reported `standard` during EDT. The candles confirm the IANA clock, and the engine verifies this live before allowing an action.
4. An engine bug was found by tests: canonical cohorts matched prior weekends by elapsed milliseconds, which excluded every prior on DST weekends of 47 or 49 hours. Fixed to observe each prior at its own Sunday 20:00 ET.
5. Only rNVDA meets the data gate. In 4 chronological evaluations every intent stood down. The full intended trim lost to keeping the holding.

## Environment notes

- Node 24.13.1, npm 11.8.0, Windows 11.
- The local DNS resolver stopped resolving Bitget hosts mid-build. A narrow fallback races the system resolver against public resolvers; TLS still verifies the real hostname.
- 2026-10-03: the mobile-hotspot network blocked `agent.bitget.com` at TCP connect. By 2026-10-06 the path was open, but the Bitget AI data MCP's research queries returned HTTP 503. The Agent Hub MCP was integrated for live candles (G5 PASS via the PRD's alternative); see GATES.
- The vitest config emits a Vite notice about ESM config loading; it is harmless.

## Frontend redesign (2026-10-06)

- **Pages:** landing (`/`), `/how-it-works`, `/method` (ten anchored sections), `/about`, and the restyled `/desk`. Shared sticky header with active route and an accessible mobile menu, skip link, and footer.
- **Visual system:** slate palette (`#335C67`, `#183338`, `#F6F4EF`, white, ink `#172C31`), no bright blue; one type system (Geist via `next/font`); non-interactive grain, grid and radial textures.
- **Motion:** GSAP with `@gsap/react` (`useGSAP`, scoped, reverted on unmount). Entrance and once-only section reveals use opacity, never `visibility`, so content stays in the accessibility tree. Nothing animates under `prefers-reduced-motion`; no scroll hijacking, pinning, counters or price animation.
- **Data on public pages:** every count, status, date and price comes from `src/server/presentation.ts`, memoized by the modification times of the data and evidence files, so pages update when they change. The desk's fallback source note now quotes the recorded data-MCP outcome instead of a fixed string.
- **Metadata:** per-page title, description, Open Graph and Twitter tags; `src/app/icon.svg` (Vercel triangle) replaces `favicon.ico`; social card at `/social-card` with no statistics. Canonical links, social image URLs and sitemap entries are emitted only for a validated `REANCHOR_SITE_URL`.
- **Audit fix:** `scripts/agent-mcp-crosscheck.ts` now exits non-zero when any check fails, so `audit:all` cannot report a failed Agent Hub run as PASS.
