# Reanchor

Stress-test one weekend rToken decision before regular US trading resumes.

A Bitget spot holder or buyer of a supported rToken states one intention: hold and consider a trim, buy a weekend dip, or sell existing tokens into a weekend rise. Reanchor compares that intention with prior weekends of the same rToken, measured from the weekend quote through the end of the first regular-session hour. It sizes the clip against recent weekend turnover and returns one action: TRIM, FADE or STAND DOWN. It also shows when Bitget cancels an unfilled weekend limit. No order is sent; the human decides.

## What works today

- **Landing page** (`/`): the weekend gap and session timeline, a three-step workflow demo, one real sourced rNVDA replay with its price sequence (missing bars stay missing), the evidence map, limitations derived from the saved records, and an FAQ.
- **How it works** (`/how-it-works`) and **About** (`/about`): the full journey with real replay values, and who the desk serves, its boundaries and its research stage.
- **Desk** (`/desk`):
  - natural-language input (needs a server model credential) with an always-available structured form;
  - editable, explicit confirmation of the intention;
  - live weekend mode or replay of any completed weekend;
  - one decision card, the historical stress-test table with a baseline comparison, the replayed outcome, a hypothetical scenario panel, and a list of sources and timestamps.
- **Method and evidence page** (`/method`): anchored sections for coverage, sessions and calendar, weekend measurement, the turnover denominator, signals and intent mapping, sizing and costs, chronological evaluation, source provenance, integration status, and assumptions. Every figure on the public pages comes from one server presentation model (`src/server/presentation.ts`) that reloads when the saved data or evidence files change.
- **Deterministic engine** (`src/domain`): pure functions for the session calendar (DST, holidays, early closes), 15-minute boundaries, the H_t turnover denominator, the chronological cohort and signal, intent mapping, sizing and precision, the order band, costs, wealth comparisons and scenarios.
- **Data pipeline** (`scripts/`): instrument discovery, ingestion with raw receipts and atomic promotion, dataset validation, replay generation, and evidence verification.

## Evidence in this build

| Item | Result |
| --- | --- |
| Verified Reality SPOT instruments | 7 of 7 candidates (rNVDA, rTSLA, rAAPL, rMSFT, rAMZN, rMETA, rQQQ) |
| Supported for research | **rNVDA only.** The others lack enough weekends with complete boundaries or usable weekend turnover (see `/method#coverage`). |
| rNVDA history | 15m bars from 2026-04-23; weekend-book trading present from late June 2026; 10 boundary-complete weekends; 12 turnover-eligible weekend sessions |
| Regular-open boundary check | Turnover steps up at least 5x at the IANA 09:30 ET bar in 23 of 23 rNVDA weekends |
| Chronological evaluation | 4 rNVDA weekends evaluated after warm-up (23 weekend rows, 13 price-complete, 10 cohort-eligible; reconciled in `docs/audit/G2_G3_AUDIT.md`). All 4 were STAND DOWN for every intent: 3 moves were not extreme and 1 had too few matched episodes. Below the 8-weekend headline minimum, so the results are exploratory and no success rate is reported. |
| Bitget AI integration (G5: PASS) | Bitget's official **Agent Hub MCP** (`@bitget-ai/bitget-agent-mcp` 3.3.1, local, read-only, no keys) supplies the live desk's 15m rToken candles; 6/6 real calls match the verified dataset (`data/agent-tool-receipts.json`). It provides public market data only. |
| Bitget AI data MCP (disclosed separately) | `bitget-mcp-server` is the source intended for corporate actions and earnings dates. Since 2026-10-06 its research queries return HTTP 503 from Bitget (receipts kept in `data/tool-receipts.json`). Corporate actions use a labeled fallback (Bitget split records plus Nasdaq dividend history); earnings dates are unavailable; underlying official prices come from Nasdaq.com. |
| Language model | Google Gemini `gemini-3.5-flash-lite` (stable; free tier on Google's pricing page, read 2026-10-06) via the server-side `GEMINI_API_KEY`. Verified on 2026-10-06 against the Gemini models endpoint and with real calls (`evidence/model-check.json`). Both jobs work: intent extraction and grounded explanations. HTTP 429 falls back to the structured form or the case fallback text, without retries. Billing was not enabled by this build. |
| Automated checks | Unit tests: 84 passed. Browser tests: 49 passed, 2 deliberately skipped (desktop, tablet, mobile; the natural-language flow runs on desktop only). Evidence verification: 10 of 10 checks passed. These checks confirm the implementation; exchange semantics are covered by the real-data checks in the G2/G3 audit. |

## Setup

Requirements: Node.js 20.9 or newer (built with Node 24.13.1), npm.

```bash
npm install
npx playwright install chromium   # only for browser tests
cp .env.example .env.local        # optional: add GEMINI_API_KEY for the two model jobs
npm run build
npm run start                     # http://localhost:3000
```

The repository includes the verified snapshot in `data/*.json`, so the app runs without re-ingesting. Live weekend checks call Bitget at request time (15-minute candles through the Bitget Agent Hub MCP, with the direct Bitget API as a labeled fallback; session calendar and states), Nasdaq.com for official stock prices, and the corporate-action fallback. The Bitget AI data MCP currently answers research queries with HTTP 503; the desk records that and uses the labeled fallback.

## Commands

| Command | Network | Purpose |
| --- | --- | --- |
| `npm run dev` / `npm run build` / `npm run start` | Live mode only | Develop, build, serve |
| `npm run typecheck` / `npm run lint` | None | TypeScript and ESLint |
| `npm test` | None | Vitest domain and adapter tests (synthetic fixtures isolated in `tests/fixtures`) |
| `npm run test:e2e` | Live-mode test only | Playwright flows at 1280, 768 and 390 px; writes `evidence/screenshots/` |
| `npm run data:discover` | Bitget | SPOT instruments, Reality identity, calendar and states, written to `data/instruments.json` |
| `npm run data:ingest` | Bitget, Nasdaq.com, Bitget AI MCP | 15m history, official anchors, corporate actions and receipts (staged, then promoted atomically) |
| `npm run data:mcp` | Bitget AI MCP, Bitget, Nasdaq.com | Refresh only the MCP receipts and corporate-action files; never overwrites a valid snapshot with a failed run |
| `npm run data:validate` | None | Integrity, boundary and turnover checks; decides support; writes `data/manifest.json` |
| `npm run data:replay` | None | `data/weekends.json` and the chronological `data/evaluations.json` |
| `npm run evidence:verify` | None | Hashes, recomputation of every saved row, Agent Hub receipts, synthetic isolation, emoji and secret scans, client-bundle check |
| `npm run agent:crosscheck` | Bitget Agent Hub MCP | Real read-only Agent Hub calls compared with the saved dataset; receipts in `data/agent-tool-receipts.json` (earlier runs kept) |
| `npm run mcp:probe` | Bitget AI data MCP | Availability probe; appends to `evidence/mcp-probe-log.json` |
| `npm run model:check` | Model provider | Verifies the configured model and makes one tiny real call; writes `evidence/model-check.json` |
| `npm run audit:g2g3` | None | Episode-level audit and sensitivity runs in `evidence/audit/` |
| `npm run audit:all` | All of the above | Runs every check in gate order and writes `evidence/audit-run.json` |

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | No | Enables intent extraction and the case explanation. Server-side only; kept in `.env.local`, which is git-ignored. |
| `REANCHOR_MODEL_PROVIDER` / `REANCHOR_MODEL` | No | Default `gemini` / `gemini-3.5-flash-lite`. `openai-compatible` is also supported. `npm run model:check` verifies the model and makes one tiny real call. |
| `REANCHOR_LLM_DISABLED` | No | `1` disables all model calls. |
| `REANCHOR_OPENAI_BASE_URL` / `REANCHOR_OPENAI_API_KEY` | Only for `openai-compatible` | Endpoint and key for an OpenAI-compatible provider. Server-side only. |
| `REANCHOR_SITE_URL` | No | Public https origin. Only when set (and not localhost) are canonical links, the social image URL and sitemap entries emitted and indexing allowed. `robots.txt` and `sitemap.xml` are prerendered, so set it before `npm run build`. |

No variable uses the `NEXT_PUBLIC_` prefix, so none reaches the browser. `.env.example` lists them all without values.

## Deployment

The app is a standard Next.js server app (Node.js runtime, no Edge routes) and builds with `npm run build`.

- **Runtime files.** Pages and API routes read `data/*.json` and three evidence files from the filesystem. `next.config.ts` lists them in `outputFileTracingIncludes`, so serverless hosts such as Vercel ship them with every route; screenshots are excluded. Nothing is written to disk at runtime; caches are in memory.
- **Environment.** Set `GEMINI_API_KEY` (and optionally `REANCHOR_MODEL_PROVIDER`, `REANCHOR_MODEL`) as server environment variables. Set `REANCHOR_SITE_URL` to the public https address before building.
- **Live mode.** Live checks spawn the Bitget Agent Hub MCP from `node_modules` (traced for API routes). If a host does not allow it, the desk uses the direct Bitget API and labels the source. A live check makes several network calls, so allow a function duration of at least 60 seconds.
- **Data refresh.** Data is refreshed by running the pipeline scripts locally and committing the results; the deployed app never ingests.

## Limitations

- Weekend rToken prices are indicative Bitget quotes, not Nasdaq transactions. The token can keep a basis to the stock after the reopening.
- Samples are small and recent. Minimum counts are reporting floors, not statistical significance. Historical resemblance is not a forecast.
- H_t is an activity proxy from weekend candle turnover, not order-book depth. Fees and slippage are assumptions. Limit fills are UNKNOWN.
- Weekend trading on Bitget is sparse. The latest closed weekend bar is often older than the 45-minute freshness limit, in which case live mode stands down.
- Four times are kept separate: weekend start (Friday 20:00 ET, documented), observed transition to the overnight session (Sunday 20:00 ET, inferred), regular cash open (09:30 ET, verified), and cancellation of unfilled weekend limits (rule documented, **timing not verified**). See `docs/audit/G2_G3_AUDIT.md`.
- Bitget and Nasdaq redistribution terms have not been verified. `data/raw/` is excluded from version control. Review the terms before public deployment.
- No orders, accounts, keys or trading paths exist in this codebase.

Further reading: `docs/METHOD.md`, `docs/DATA_GATE.md`, `docs/CLAIM_LEDGER.md`, `docs/VALIDATION.md`, `docs/GATES.md`, `docs/SUBMISSION.md`, `docs/BUILD_REPORT.md`. The product contract is `docs/PRD.md`.
