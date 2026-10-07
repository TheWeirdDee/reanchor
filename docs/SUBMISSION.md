# Submission package (draft, not submitted)

Nothing here has been submitted or posted. Deployment, posting and submission require the owner's authorization.

## Current form (read 2026-10-03 around 05:45 UTC via forms.gle/GyWZCMCPocgJdJon6)

- **Deadline stated on the form:** "October 8, 23:59 (UTC+8)", which is October 8, 16:59 WAT. The PRD's internal target, October 7 18:00 WAT, is earlier.
- **Track dropdown:** Alpha Factory, Agentic Trading, AI Trading Desk. Use **AI Trading Desk**.
- **Sub-theme:** free text referencing the Developer Handbook. Use "Decision Stress Testing".
- **Required:**
  - team name, team lead Bitget UID, email and contact;
  - member background;
  - how you heard about the event;
  - project name, one-line summary (max 140 characters) and project description;
  - submission material links (project link and run records required; a demo video of at most 3 minutes strongly recommended);
  - role of the LLM/AI;
  - X project post URL;
  - S1 participation;
  - K3 token credits choice;
  - playbook review interest.
- **Optional:** university name (University Special Award pool) and Demo Day application.
- **Difference from the PRD:** the form's project description has **five** parts (Thesis, Target User, Validation Data, Progress, Optional AI Trading Take), not six. "Deliverables" is not a separate part; links go in the materials field. The form also requires "Run records".

## Unresolved schedule questions

1. Voting and results dates for the extended schedule. They are not on the form. Check the official @Bitget_AI posts and the hub before submitting.
2. Whether "October 8, 23:59 (UTC+8)" supersedes any other cutoff on the hub (the hub page could not be loaded from the build machine's network).
3. Whether a demo video posted on X must quote the same official post as the project post.
4. What counts as "Run records" for an AI Trading Desk entry. Proposed: a link to the sourced replay page plus `evidence/verification-report.json`.

## One-line summary (135 characters)

Reanchor stress-tests a weekend rToken trade against prior reopenings, sizes the clip, and explains Bitget's weekend-limit cancel rule.

## Project description (five form parts)

1. **Thesis.**
   - Weekend rToken prices are indicative Bitget quotes, and a holder who cannot watch the next US open has to decide without seeing the reopening.
   - Reanchor turns one weekend intention into a sourced stress test: it compares the intended action with prior reopenings of the same rToken, measured from the weekend quote through the first regular-session hour.
   - It then sizes the clip against recent weekend turnover and quotes Bitget's rule for cancelling unfilled weekend limits, stating plainly that its exact timing is not verified.
2. **Target user.**
   - A Bitget spot holder or buyer of supported rTokens with roughly 5,000 to 50,000 USDT who trades a few times a month and cannot watch the US open. This segment is a product hypothesis, not an observed user count.
   - The completed task is a confirmed intention, a source-backed stress test, one compatible action (TRIM, FADE or STAND DOWN), a maximum modeled clip, and the cancellation rule with its unverified timing flagged. No order is sent.
3. **Validation data.**
   - All 7 candidate rTokens were verified as Reality SPOT instruments. Only rNVDA had enough weekend boundaries and usable weekend turnover; the others are shown with their exclusion reasons.
   - On rNVDA, the regular-open boundary was confirmed in 23 of 23 weekends.
   - In a chronological replay of 4 evaluable weekends, the desk stood down every time. The full intended trim would have lost 14.71 USDT at default costs against keeping the holding.
   - That is below our 8-weekend headline minimum, so we report it as exploratory and claim no edge.
   - User study: protocol written, no participants yet.
4. **Progress.**
   - Working landing page, desk and method pages, a deterministic engine, and a data pipeline with receipts.
   - Both model jobs run on Google Gemini (`gemini-3.5-flash-lite`), verified with real calls; every explanation is checked against the computed card before display.
   - Live rToken candles come through Bitget's official Agent Hub MCP (read-only, no keys); 6/6 real calls match our verified dataset.
   - 84 unit tests, 49 browser checks at three widths, and evidence recomputation (all 23 weekend rows and 69 replay rows reproduce).
   - Tool failures, disclosed:
     - The Bitget AI data MCP connects, but since 2026-10-06 every research query (corporate actions, earnings, quotes) returns HTTP 503 from Bitget. Failure receipts are kept; a labeled Bitget split-records plus Nasdaq dividends fallback covers corporate actions.
     - The data MCP's historical-price entry returned no data even when the service was up.
     - Bitget's states endpoint mislabeled DST; we verified the clock from candle evidence.
     - Bitget does not document when unfilled weekend limits are cancelled; the desk quotes the rule and marks the timing as not verified.
5. **AI trading take (optional).** Weekend tokenized-stock prices are a sparse, indicative market. The useful AI role is to make the human's intention precise and explain hard evidence, not to pick trades: in our first evaluated weekends the honest answer was usually to stand down.

## Role of the LLM

The model has two jobs:
- It extracts the user's sentence into an editable, schema-validated intention (instrument, intent, holding, trade size, limit). Absent fields stay blank, and user price claims are never treated as market data.
- It writes a four-to-six sentence explanation of the already-computed card. Any number not present in the card, a changed action, or forecast language causes the text to be discarded.

Deterministic code selects cohorts, computes every number, chooses the action and sizes the clip. Model: Google Gemini `gemini-3.5-flash-lite` (Gemini API, server-side key), used for both jobs and verified with real calls on 2026-10-06. Rate limits fall back to the structured form or a fixed "Case unavailable" text. Qwen is not used.

## Materials index

| Material | Location | Status |
| --- | --- | --- |
| Public demo URL | none | Requires authorized deployment |
| Repository | local `reanchor/` | Not pushed |
| README | `README.md` | Done |
| Method | `docs/METHOD.md`, `/method` | Done |
| Data gate | `docs/DATA_GATE.md` | Done |
| Claim ledger | `docs/CLAIM_LEDGER.md` | Done |
| Validation | `docs/VALIDATION.md` | Historical done; user study planned |
| Run records | `data/evaluations.json`, `evidence/verification-report.json`, `evidence/e2e-results.json`, `evidence/model-check.json`, `docs/audit/G2_G3_AUDIT.md`, `docs/audit/RNVDA_EPISODES.md` | Done |
| Tool receipts | `data/agent-tool-receipts.json` (Agent Hub MCP, 6/6 OK), `data/tool-receipts.json` (data MCP, 503 failures preserved), `evidence/mcp-probe-log.json`, `evidence/mcp-probe-2026-10-02/` | Agent Hub working; data MCP blocked upstream |
| Screenshots | `evidence/screenshots/` | Done (actual screens) |
| Demo video | script below | Not recorded |
| X post | draft below | Not posted |

## X post draft (not posted)

> Weekend rToken prices are not the next US open. Reanchor stress-tests a weekend trim, buy or sale against prior reopenings, sizes it against weekend turnover, and explains Bitget's rule for unfilled weekend limits. Human decides. #BitgetHackathon @Bitget_AI

(257 characters; within the standard 280-character limit before the quoted post.)

Quote target: https://x.com/Bitget_AI/status/2100519318824055159. Check the form's current requirement before posting.

## Demo script (about 90 seconds)

Record on the local production build (`npm run build && npm run start`). Not recorded yet.

1. (0:00) Landing headline, then "Who it is for" and the real sourced weekend: Friday reference 225.00, Sunday quote 223.55, reopening 229.56, first-hour end 231.27.
2. (0:12) Open the desk. Type "I want to sell 500 of my 2000 USDT rNVDA position at 240" and press Extract fields. Show the "From your text" badges and that research stays disabled until Confirm intention.
3. (0:28) Choose "Replay a past weekend", the weekend of 2026-09-25, and stress-test. The card shows STAND DOWN, the threshold 0.61% against the move -0.64%, and 1 matched weekend of the 3 needed.
4. (0:42) Point at "Cancellation timing not verified" with Bitget's quoted rule, and the separate facts: observed transition (Sun 20:00 ET) and regular cash open (Mon 09:30 ET).
5. (0:52) Read the Gemini case explanation and note the line "Every number was checked against the card".
6. (1:02) Scroll the history table: matched, eligible and excluded rows with reasons, and the baseline where the full sale lost to keeping the holding.
7. (1:12) Move the scenario slider to -5% and show that the action does not change.
8. (1:20) Open Sources and timestamps: Agent Hub MCP candles in live mode, and the corporate-action fallback label. Close on the method page coverage table.

## Source register

| Source | URL | Accessed | Used for |
| --- | --- | --- | --- |
| Submission form | https://forms.gle/GyWZCMCPocgJdJon6 | 2026-10-03 | Fields, track, deadline |
| Official extension post | https://x.com/Bitget_AI/status/2103047860602495198 | Not loaded (PRD reference) | Deadline context |
| Quote-post target | https://x.com/Bitget_AI/status/2100519318824055159 | Not loaded | X post requirement |
| Hackathon hub | https://www.bitget.com/activity-hub/hackathon | Unreachable from the build network | Schedule |
| Weekend rules | https://www.bitget.com/support/articles/12560603892041 | 2026-10-02 | Session times, ±20% band, cancellation |
| Market data docs | https://www.bitget.com/docs/catalog/market/market-data | 2026-10-02 | Candle endpoints |
| Reality guide and market data | https://www.bitget.com/docs/uta/reality-trading-guide, /docs/catalog/reality/market-data | 2026-10-02 | Intervals, states, calendar |
| Changelog | https://www.bitget.com/legacy-docs/uta/changelog | 2026-10-02 | Turnover valid from 2026-07-09 |
| Split records | https://www.bitget.com/api-doc/uta/public/Get-Split-Records | 2026-10-02 (search) | Fallback split source |
| Bitget AI data MCP | https://agent.bitget.com/mcp | 2026-10-02 (probe OK); 2026-10-06 (503 on research queries) | Corporate actions, earnings dates (blocked) |
| NYSE calendar | https://www.nyse.com/markets/hours-calendars | 2026-10-02 | Holidays and early closes |
| Nasdaq.com | api.nasdaq.com historical and dividends | 2026-10-02 / 10-03 | Official anchors, dividends |
| Bitget Agent Hub MCP | https://github.com/Bitget-AI/agent-mcp (`@bitget-ai/bitget-agent-mcp` 3.3.1) | 2026-10-06 | Live token candles, instrument metadata cross-check |
| Gemini API | https://ai.google.dev/gemini-api/docs/models and /pricing | 2026-10-06 | Model selection (gemini-3.5-flash-lite, free tier) |
