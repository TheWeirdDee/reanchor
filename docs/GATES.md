# Gate register

Prepared 2026-10-06 for the gate-by-gate audit. Re-run everything with `npm run audit:all` (writes `evidence/audit-run.json`), or `npm run audit:all -- --offline` to skip the four network steps.

Evidence classes used in every gate:

| Class | Meaning |
| --- | --- |
| **Tests** | Implementation verified by automated tests. Shows the code does what it was written to do; does not by itself establish exchange semantics. |
| **Real data** | Verified against real external responses (Bitget, Bitget AI tools, Nasdaq.com, NYSE, Gemini). |
| **Browser** | Product behavior observed in a real browser (Playwright at 1280, 768 and 390 px; screenshots reviewed). |
| **Open** | Blocked or unvalidated claims. |

Status vocabulary:
- **PASS**: every required part of the gate has evidence.
- **PARTIAL**: met for part of its scope; the rest is listed under Open.
- **BLOCKED**: an external dependency or a pending authorization prevents the gate.

## Summary

| Gate | Status | One-line basis |
| --- | --- | --- |
| G1 Setup and architecture | PASS | Typecheck, lint, 84 unit tests, production build |
| G2 Instruments, candle history, provenance | PARTIAL | All 7 identities verified; only rNVDA has enough weekend data; redistribution terms unverified |
| G3 Sessions, calendar, episodes | PARTIAL | Open and calendar verified; Sunday transition inferred; cancellation timing not verified |
| G4 Research engine, mapping, sizing, accounting | PASS (implementation) | All rules tested; 69 replay rows reproduce; research outcome exploratory (4 evaluations) |
| G5 Bitget AI integration | PASS (Agent Hub alternative) | Official Agent Hub MCP, read-only, 6/6 real calls match; live candles use it. Data MCP outage disclosed separately |
| G6 LLM extraction and explanation | PASS | Gemini `gemini-3.5-flash-lite` verified with real calls; both jobs observed in the browser |
| G7 Landing, desk, method, about, how it works, responsive | PASS | 49 browser checks at three widths across five pages, 2 deliberate skips |
| G8 Historical comparisons, limitations, validation protocol | PARTIAL | Historical report done; usability study planned, not run |
| G9 Verification, security, evidence consistency | PASS | `evidence:verify` 10/10 |
| G10 Submission and deployment readiness | BLOCKED | Needs authorization for deployment, video, X post and submission |

---

## G1 Setup and architecture: PASS

- **Requirement:** Next.js App Router, strict TypeScript, Tailwind, lucide-react, Zod, timezone library, MCP SDK, Vitest, Playwright, ESLint, a single npm lockfile; architecture split into app, components, domain, server, scripts, data, docs and tests.
- **Tests:** `npm run typecheck`, `npm run lint`, `npm test` (84 passing).
- **Real data:** n/a.
- **Browser:** the production server serves `/`, `/desk` and `/method`.
- **Evidence:** `package.json`, `package-lock.json`, `evidence/audit-run.json`.
- **Open:** none.

## G2 Instruments, candle history, provenance: PARTIAL

- **Requirement:** verified instruments with exact symbols and Reality identity; 15m history with raw responses and receipts; normalization; missing vs zero; turnover units; coverage; exclusions.
- **Tests:** normalization, unclosed bars, invalid OHLC, off-grid bars, identical and conflicting duplicates, missing vs zero turnover, adapter schemas (`tests/unit/candles-episodes.test.ts`, `adapters-model.test.ts`).
- **Real data:**
  - Identity of all 7 candidates from `GET /api/v3/market/instruments` and Reality `stock-info`.
  - 15m history pulled with raw pages (`data/raw/`, local only) and receipts.
  - Interval-start semantics confirmed by the 09:30 turnover step.
  - USDT quote units: turnover/volume inside the bar range for over 99% of bars.
  - Instrument metadata and boundary bars independently re-confirmed through the Bitget Agent Hub MCP (`data/agent-tool-receipts.json`).
- **Browser:** coverage table on `/method`.
- **Reproduce:** `npm run data:validate`, `npm run audit:g2g3`, `npm run agent:crosscheck`.
- **Evidence:** `data/instruments.json`, `data/manifest.json`, `data/validation-report.json`, `docs/DATA_GATE.md`, `docs/audit/G2_G3_AUDIT.md`, `docs/audit/RNVDA_EPISODES.md`.
- **Open:**
  - Only rNVDA meets the data gate; the other 6 are shown with reasons.
  - Pre-2026-07-09 turnover is excluded by rule.
  - Weekday candle volume mirrors the whole US market and is not used for H_t.
  - Bitget and Nasdaq redistribution terms are unverified.
- **Blocks:** claims about the other 6 rTokens; public deployment until terms are reviewed.

## G3 Sessions, calendar, episodes: PARTIAL

- **Requirement:** America/New_York sessions, DST, holidays, early closes, Bitget reconciliation, exact 15m boundaries, total reopening return including the gap, canonical and matched cutoffs.
- **Tests:** DST in both directions, holidays, early close, Bitget closure reconciliation, boundaries, gap inclusion, DST-weekend canonical cohort, H_t strictly before t, nonstandard-weekend hard failure (`tests/unit/calendar.test.ts`, `signal-decision.test.ts`).
- **Real data:**
  - Regular open at 09:30 ET verified (Bitget states, NYSE calendar, candle turnover step in 23/23 and 17/17 weekends).
  - Friday 20:00 ET weekend start documented verbatim in the saved Bitget article (`evidence/sources/`).
  - The article names NVDA among weekend-tradable assets.
  - The Sunday 20:00 ET transition is **inferred** from states, calendar and candles.
- **Browser:** the card shows the observed transition and the cash open as separate facts, and "Cancellation timing not verified" with no clock time (asserted in `tests/e2e/flows.spec.ts`).
- **Reproduce:** `npm test`, `npm run audit:g2g3`.
- **Evidence:** `docs/audit/G2_G3_AUDIT.md`, `evidence/sources/bitget-support-12560603892041.html`.
- **Open:**
  - Cancellation timing of unfilled weekend limits is not verified (the FAQ 13 rule has no timestamp).
  - Bitget's calendar lacks Memorial Day 2026 and future holidays, so those weekends are unreconciled and stand down.
- **Blocks:** any cancellation-time claim.

## G4 Research engine, mapping, sizing, accounting: PASS (implementation)

- **Requirement:** chronological evaluation, one H_t denominator, sample minimums, intent mapping, hard failures, sizing and precision, band, costs, separate buy and holding accounting, no shorting.
- **Tests:**
  - corrupted future data has no effect;
  - mapping for every intent and side;
  - no shorting, band, precision, minimum notional;
  - costs, wealth comparisons, stale and missing-turnover failures.
- **Real data:** 23 weekend rows and 69 replay rows (23 weekends x 3 intents) recompute from saved bars. 4 rNVDA weekends were evaluated, all STAND DOWN: 3 moves were not extreme, and 1 had 1 matched weekend of the 3 required.
- **Browser:** replay card, history table, baseline and realized outcome.
- **Reproduce:** `npm run data:replay`, `npm run evidence:verify`, `npm run audit:g2g3`.
- **Evidence:** `data/evaluations.json`, `evidence/audit/sensitivity.json`, `docs/VALIDATION.md`.
- **Open:**
  - Fewer than 8 evaluations, so no headline rate.
  - The fade or trim hypothesis is untested.
  - Two implementation-added thresholds (6 complete hours; two-thirds agreement) change no outcome in sensitivity runs.
- **Blocks:** any edge or success-rate claim.

## G5 Bitget AI integration: PASS (Agent Hub alternative)

- **Requirement (revised PRD section 4):** use a relevant read-only Bitget AI tool with real calls and saved receipts. "A working relevant Agent Hub market operation can serve as an alternative Bitget AI tool integration, but it must materially contribute and be demonstrated."
- **What passes:** Bitget's official **Agent Hub MCP** (`@bitget-ai/bitget-agent-mcp` 3.3.1). It runs locally over stdio with `--read-only` and no credentials. Only the public `market` verb is used, with an allowlist of `candles`, `candlesHistory`, `instruments` and `tickers`.
  - **Real calls:** 6/6 OK on 2026-10-06. Every value matches the verified dataset:
    - rNVDA instrument precision, minimum notional and limit ratios;
    - the four boundary bars of the 2026-09-26 weekend (Friday reference 225, Sunday decision 223.55, reopening 229.56, first-hour end 231.27);
    - recent candles.
  - **Material contribution:** the live desk takes its 15m bars, and therefore the live decision price, from Agent Hub `market.candles`. The direct v3 endpoint is a labeled fallback. Observed in a live run: provenance "Bitget Agent Hub MCP market.candles", 999 bars, content hash recorded.
- **What Agent Hub does not do:** its catalog (109 v3 operations) has no stock fundamentals, corporate actions, earnings dates, Reality calendar or underlying-stock prices. Nothing in the app attributes those to it.
- **Tests:** market-action allowlist and not-connected guard (`tests/unit/adapters-model.test.ts`); the data-MCP allowlist and failure handling.
- **Browser:** live-mode run in `tests/e2e/flows.spec.ts`; the Sources section shows the candle source.
- **Reproduce:** `npm run agent:crosscheck` (network, public, read-only); `npm run evidence:verify` requires every cross-check to pass.
- **Evidence:** `data/agent-tool-receipts.json`, `evidence/agent-mcp-discovery.json`, `src/server/agent-mcp.ts`, `src/server/live.ts`.

### Separate disclosure: Bitget AI data MCP outage and corporate-action fallback

- The Bitget AI data MCP (`https://agent.bitget.com/mcp`, `bitget-mcp-server` 4.0.5) was the PRD's preferred source for underlying-stock and corporate-action research.
- It answered on 2026-10-02 (raw probe files in `evidence/mcp-probe-2026-10-02/`).
- Since 2026-10-06 the app's client connects and lists tools, and the catalog call (`guide`) succeeds. Every research query (dividends and splits, earnings calendar, quote, historical) returns HTTP 503 "Service Temporarily Unavailable". This was also reproduced with raw curl, outside the app.
- Receipts:
  - `data/tool-receipts.json` holds the 23 failed calls of the latest refresh (2026-10-06 05:27 UTC) and a summary of all 6 refresh attempts.
  - `evidence/mcp-probe-log.json` holds all 25 probe attempts.
  - Disclosure: before 2026-10-06 10:20 UTC each refresh replaced the previous run's individual receipts, so for the five earlier refreshes only their attempt summaries survive.
  - From now on, replaced runs move into `receiptHistory`, and failed runs that keep a valid snapshot go into `failedRunReceipts`.
  - Agent Hub receipts keep every earlier run in `history`.
- Catalog calls are not counted as research.
- **Corporate actions therefore come from a labeled fallback:** Bitget `GET /api/v3/market/split-records` plus Nasdaq.com dividend history (`data/corporate-fallback.json`). Every card and the Sources table say "Bitget AI MCP unavailable; fallback sources used". Earnings dates are unavailable while the outage lasts.
- **Underlying official open and close** come from Nasdaq.com, attributed as such. They never come from Agent Hub.
- To refresh when the data MCP recovers: `npm run mcp:probe`, then `npm run data:mcp; npm run data:validate && npm run data:replay && npm run audit:g2g3 && npm run evidence:verify`.

## G6 LLM extraction and explanation: PASS

- **Requirement:** extract the intention into a validated schema with nulls for absent fields and editable confirmation; explain the computed card in 4 to 6 grounded sentences; never change action or clip; fallbacks.
- **Tests:**
  - grounding validator (ungrounded numbers, changed action, emoji, forecast language, injected instructions, timestamped cancellation, leaked field names or null);
  - provider configuration and model verification;
  - 429 mapped to fallback without retry;
  - thought-part parsing.
- **Real data:** `gemini-3.5-flash-lite` verified on the Gemini models endpoint and with real calls (`evidence/model-check.json`). Real `/api/parse` cases: hold, buy with limit, partial sale, unsupported short, injection attempt ignored. Real `/api/explain` cases all passed validation.
- **Browser:** natural-language flow at 1280 and 390 px: extraction, "From your text" badges, research blocked until confirmation, card, validated explanation with model name.
- **Reproduce:** `npm run model:check` (network, one tiny call), `npm test`, `npm run test:e2e`.
- **Evidence:** `src/server/model.ts`, `src/server/llm-provider.ts`, `evidence/screenshots/desk-nl-desktop.png` (current design); earlier captures `evidence/screenshots/pre-redesign/nl-confirm-desktop.png`, `case-explanation-desktop.png`.
- **Open:**
  - The key's billing tier cannot be read from API responses (billing was not enabled by this build).
  - Explanation style varies; the validator checks grounding, not style.

## G7 Landing, desk, method, responsive: PASS

- **Requirement:** landing page answering the five questions with a real example; desk with natural-language and structured input, confirmation, controls, card, history, replay, scenario, sources and all error states; method page; responsive and keyboard accessible.
- **Browser:** 49 Playwright checks pass at 1280, 768 and 390 px, with 2 deliberate skips (the natural-language test runs on desktop only, to conserve free-tier quota). Covered across the five public pages (`/`, `/how-it-works`, `/method`, `/about`, `/desk`):
  - every page renders with no console errors, hydration or GSAP warnings, no page-wide overflow, and no broken internal links or anchors;
  - header active route, mobile menu (Escape closes it and returns focus), anchor offsets below the sticky header;
  - reduced motion: no animated element is left hidden or transformed;
  - natural-language and structured flows, confirmation gate (any edit clears confirmation), replay change and scenario;
  - missing turnover, unknown underlying anchor and stale observation (test-only mutations of a real research response, never saved or served);
  - model-unavailable fallback, provider failure and case fallback, live outside-session run;
  - sources as cards on phones and a table from tablet width;
  - metadata, icon and theme color on every page, with no localhost URLs;
  - keyboard: skip link, visible focus, desk controls.
- **Reproduce:** `npm run test:e2e`.
- **Evidence:** `evidence/e2e-results.json`, `evidence/screenshots/`.
- **Open:** none for the visitor flow.

## G8 Historical comparisons, limitations, validation protocol: PARTIAL

- **Real data:** chronological replay report from real data with predeclared reference inputs, losing baselines and cost sensitivity (`data/evaluations.json`, `/method`).
- **Open:**
  - Only a usability **protocol** exists (`docs/VALIDATION.md`); no participant was recruited and no user validation has been observed.
  - Holdout validation is unavailable (rQQQ fails the data gate).
- **Blocks:** any user-validation claim.

## G9 Verification, security, evidence consistency: PASS

- **Tests and real data:** `npm run evidence:verify` runs 10 checks:
  1. manifest hashes;
  2. weekend-row recomputation;
  3. replay-row recomputation;
  4. Agent Hub cross-check;
  5. turnover units;
  6. synthetic isolation;
  7. no emoji;
  8. no secrets (with a positive control against the real key format);
  9. `.env.local` git-ignored;
  10. client bundles free of secrets and server adapters.
- **Evidence:** `evidence/verification-report.json`.
- **Open:** passing tests do not establish exchange semantics; those rest on the G2 and G3 real-data checks.

## G10 Submission and deployment readiness: BLOCKED (authorization)

- **Done:** current form fields and deadline read; drafts of the five-part description, LLM role, X post, demo script, materials index and source register (`docs/SUBMISSION.md`); the production build runs locally.
- **Open:** deployment, demo recording, X post and form submission each need separate authorization. Voting and results dates are unconfirmed.

## Corrections log

1. 2026-10-03: the definitive Sunday cancellation time was removed; the card shows "Cancellation timing not verified" with the documented rule.
2. 2026-10-03: H_t uses sessions completed strictly before t (the evaluated weekend's own session had been included).
3. 2026-10-03: nonstandard (holiday or early-close) current weekends are a hard failure.
4. 2026-10-03: fields were renamed to `transitionMs`, `calendarStatus` and `BETWEEN_TRANSITION_AND_OPEN`.
5. 2026-10-03: model provider and model are configurable and verified before use.
6. 2026-10-06: the Anthropic adapter was replaced by Gemini; the validator also rejects leaked field names and null; only definitive model verifications are cached.
7. 2026-10-06: Bitget Agent Hub MCP integrated for live candles. G5 changed from BLOCKED to PASS on the PRD's permitted alternative; the data-MCP outage and corporate-action fallback stay disclosed separately.
8. 2026-10-06: the Bitget weekend-rules article was saved verbatim. Instrument scope is confirmed for NVDA; cancellation timing is still not verified.
9. 2026-10-06: receipt files now keep every run (data MCP `receiptHistory` and `failedRunReceipts`; Agent Hub `history`). The audit runner records the data MCP's actual research outcome separately from its step status.
