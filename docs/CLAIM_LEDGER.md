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
