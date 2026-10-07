# Claim ledger

Each user-facing claim maps to its source and calculation. Categories: **O** observed market data, **A** assumption, **H** historical modeled outcome, **S** hypothetical scenario, **U** user-study observation (none exist).

| Where | Claim | Category | Source / calculation |
| --- | --- | --- | --- |
| Card | Observed weekend-to-overnight transition | O + inferred | Bitget states (overnight 20:00-04:00 ET), Bitget calendar closure windows, candle regime change; not a cancellation time (`docs/audit/G2_G3_AUDIT.md` 1.2) |
| Card | Regular US cash-market open | O | Bitget states regular 09:30-16:00, NYSE calendar, candle turnover step (verified) |
| Card | Friday reference, decision price | O | Bitget v3 15m bar closes: historical from saved history-candles; live from Bitget Agent Hub MCP `market.candles` (direct v3 fallback), cross-checked in `data/agent-tool-receipts.json` |
| Card | Observation age, fresh or stale | O + A | Request time minus bar end; the 45-minute limit is an assumption |
| Card | Weekend move `w` | O (derived) | `decision / friday_ref - 1` |
| Card | Underlying official close and open | O | Nasdaq.com historical quotes (`server/nasdaq.ts`); UNKNOWN when unavailable |
| Card | Extreme-move threshold | H | Type-7 70th percentile of prior absolute `w` (`signal.ts`) |
| Card | Eligible and matched counts, matched median `r`, signal | H | `evaluateSignal`, using only weekends completed before the decision |
| Card | Action and side | Rule | `computeCard` deterministic mapping; the model cannot change it |
| Card | Intended clip | User input | 25% of the holding, or the stated trade |
| Card | Modeled clip and quantity | H + A | `sizeClip`: the 10% H_t cap, holdings, precision flooring, minimum notional |
| Card | H_t | O (derived) | Median of the three latest weekend-session medians of complete-hour USDT turnover (`turnover.ts`) |
| Card | Participation | Derived | Clip / H_t |
| Card | Limit band status and range | O + A | Bitget support (about ±20%) and instrument limit ratio; labeled approximate (`checkBand`) |
| Card | Costs (0.10% fee, 5 or 15 bps) | A | `accounting.ts`; labeled assumptions |
| Card | Limit fill UNKNOWN | Statement | No fill evidence exists |
| Card | Corporate-action status | O | Bitget AI MCP when reachable; otherwise Bitget split records + Nasdaq dividends, labeled |
| Card | Earnings note | O | Bitget AI MCP `equity_calendar` snapshot (shown only when available) |
| Card | Cancellation rule, "Cancellation timing not verified" | O (rule only) | Bitget support article 12560603892041, FAQ 13, verbatim in the saved copy `evidence/sources/bitget-support-12560603892041.html` (the article names NVDA among weekend-tradable assets); no timestamp attached (`docs/audit/G2_G3_AUDIT.md` 1.4) |
| History table | Per-weekend prices, `g`, `r` | O | Bitget 15m bars at exact boundaries |
| History table | Intended vs no trade, modeled vs no trade | H + A | `compare()`: hypothetical fills at observed quotes, default costs |
| Baseline table | Sums by cost case | H + A | `computeCard` baseline; descriptive, not a success rate |
| Replay outcome | Realized `g`, `r`, wealth | O + H | Revealed after the decision; never used by it |
| Scenario | Implied underlying and token values, P&L | S | `runScenario`; hypothetical, before costs |
| Scenario | Default basis | O (derived) | Median of prior token reopen over official open, minus 1 |
| Landing | rNVDA weekend after 2026-09-25 example | O | `data/weekends.json` row `2026-09-26` |
| Landing | "stood down 4 times" | H | `data/evaluations.json` RNVDAUSDT HOLD |
| Method | Coverage table | O | `data/validation-report.json` |
| Method | Validation tables | H | `data/evaluations.json` |
| Method | MCP status and successful call count | O | `data/tool-receipts.json` |
| Explanation | Case text | Model | Validated against the card facts; discarded if any number, the action or the wording fails (`validateExplanation`) |
| Anywhere | Usability results | U | **None collected.** See `VALIDATION.md` |

Every saved weekend row and evaluation row is recomputed by `npm run evidence:verify` (23/23 and 69/69 reproduce at build time).

## Decision explanation elements (added 2026-10-07)

| Where | Claim | Category | Source / calculation |
| --- | --- | --- | --- |
| Card | "You asked" | User input | The confirmed intention (`intentSummary`, `src/components/desk/DecisionWhy.tsx`) |
| Card | "Compared against N prior weekends" | H | `card.signal.eligibleCount` and `excludedCount`; only weekends completed before the decision |
| Card | "Evidence found" | H | First unmet rule, in engine order: eligible count vs `MIN_ELIGIBLE_EPISODES`, move vs threshold, matched count vs `MIN_MATCHED_EPISODES` |
| Card | "Rule applied" | Rule | First hard failure, else the first stand-down reason, else the action mapping; all from `computeCard` |
| Card | Threshold meter "X found · 3 required" | H | `card.signal.matchedCount` against `MIN_MATCHED_EPISODES`; shown only when the move is extreme |
| Card | "Not because the market is safe." | Statement | Shown only when the action is STAND DOWN and no hard check failed |
| Card | Information boundary strip | O | Friday reference bar end, decision time `card.t`, reopening and first-hour end from `card.session`; the right side is never used by the rules |
| History | Examined, eligible, matched, excluded counts | H | Counts of `card.history` rows by status |
| Replay outcome | "Decision made ... Everything below happened afterwards." | O | `card.t`; outcome values from `card.realized` |
| Desk step 1 | "You said" and "Gemini extracted" | Model + user | The submitted sentence and the extraction fields returned by `/api/parse`; nothing runs until confirmation |

## Demo video v2 claims (2026-10-07, `reanchor-demo-v2.mp4`, 1:38)

Every caption below was checked against the frame where it appears.

| Time | Claim | Value | Class | Visible proof |
| --- | --- | --- | --- | --- |
| 0:11 | Gemini only extracts fields; it does not choose the trade | rNVDA, Hold, 2,000 USDT | LIVE (model) | "You said" / "Gemini extracted" panel and the authority panel |
| 0:19 | Nothing runs until confirmation | | LIVE | Run button enabled only after "Confirm intention" |
| 0:28 | Decision STAND DOWN, not because the market is safe | STAND DOWN | H, computed | Card header |
| 0:28 | Compared against 9 prior weekends finished before the decision | 9 eligible, 13 excluded | H | "Compared against" cell |
| 0:28 | 1 comparable extreme found, 3 required | 1 / 3 | H | Threshold meter and "Evidence found" cell |
| 0:42 | Decision at Sunday 20:00 ET; reopening and first hour later | Sun 2026-09-27 20:00 ET; Mon 09:30 and 10:30 ET | O | Information boundary strip |
| 0:48 | 22 examined, 9 eligible, 1 matched, 13 excluded | 22 / 9 / 1 / 13 | H | History counts |
| 0:54 | Reopened +2.69% after the decision; not used | +2.69% | O, revealed after | "What happened after this replay decision" |
| 1:05 | Live candles from Bitget Agent Hub MCP with time and content hash | 999 bars, sha256 | O, live at recording | Sources row "Bitget Agent Hub MCP market.candles" |
| 1:05 | Outside the weekend session the live desk stands down | | LIVE | Live card reason "Not inside a verified weekend session" |
| 1:19 | Bitget AI data MCP returns HTTP 503; labeled fallback used | 503 | O (probe log) | Integration status card |
| 1:24 | Integration calls saved as public receipts | | O | `data/agent-tool-receipts.json` on GitHub |

Recorded against the production build of this tree (local `next start`), with live Bitget and Gemini calls; no response was mocked.
