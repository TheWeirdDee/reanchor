# Method

This document describes the implemented rules. Code references are to `src/domain/*` unless stated. Product assumptions (choices not fixed by an exchange or the PRD) are marked **[assumption]**.

## 1. Instruments

- Source: `GET /api/v3/market/instruments?category=SPOT` (Bitget v3).
- Identity: exact `baseCoin` match for each PRD candidate. The instrument must also have `quoteCoin=USDT`, `isReality=yes`, `symbolType=stock` and `status=online`. Reality `stock-info` must return `weekendTradable=yes` with `code` equal to the base coin minus its `r` prefix. Symbols keep their exact case (`RNVDAUSDT`, base `rNVDA`).
- Precision, minimum quantity, minimum notional and the limit-price ratios come from the same response.
- Support: identity verified, at least 7 weekends with all four boundaries (so that at least one evaluation has 6 prior episodes), and at least 3 turnover-eligible weekend sessions (`scripts/validate-dataset.ts`).

## 2. Session calendar (`calendar.ts`)

- America/New_York through the IANA database (`@date-fns/tz`). The NYSE holidays and early closes for 2026–2027 come from nyse.com. Dates outside those years return UNKNOWN.
- **Weekend quote window**: from 20:00 ET on the last trading day to the observed transition, 20:00 ET on the evening before the next trading day. For a standard weekend that is Friday 20:00 to Sunday 20:00 ET.
- **Regular reopening**: 09:30 ET on the next trading day. **Endpoint**: 10:30 ET.
- **Standard weekend**: last trading day is a Friday that is not an early close, and the next trading day is a Monday. All other weekends are excluded from the primary cohort with their reason.
- **Reconciliation with Bitget**: every NYSE holiday inside the window must appear in `GET /api/v3/reality/market/calendar` as a closure ending at 20:00 ET on that date, and Bitget may list no unexpected closure. Otherwise the switch is UNRECONCILED and the weekend is excluded (current action: STAND DOWN). Bitget labels the zone "EST", but its values are New York wall time; a 20:00 closure end matches the observed candle regime change in both EDT and EST.
- **Four separate times** (full evidence in `docs/audit/G2_G3_AUDIT.md` section 1):
  1. *Weekend matching start*, Friday 20:00 ET. Documented verbatim in the saved Bitget support article (`evidence/sources/`, FAQ 2): Saturday 08:00 UTC+8 in DST and 09:00 in standard time, and "the moment after-hours trading ends on Friday, the system automatically switches to the weekend trading session". The article names NVDA among weekend-tradable assets; per-instrument eligibility is also confirmed by Reality stock-info `weekendTradable`.
  2. *End of weekend-only quotes and start of the weekday overnight session*, Sunday 20:00 ET (`transitionMs`). **Inferred**, not documented as one statement: Bitget states lists overnight 20:00 to 04:00 ET, the calendar ends holiday closures at 20:00 ET, and candles change regime at that bar. Used for the canonical decision time and to end live weekend decisions.
  3. *Regular US cash-market open*, 09:30 ET on the next trading day (`reopenMs`). **Verified**: Bitget states, the NYSE calendar, and the candle turnover step. All reopening measurements use it.
  4. *Cancellation of unfilled weekend limits*: **timing not verified.** Bitget documents the rule ("when the system switches back to regular trading on Monday's US stock market open") without a timestamp, and candles cannot show order cancellation. The card quotes the rule and attaches no time. The PRD wording ("ends at the next actual regular-session reopening") and the earlier build report (Sunday 20:00 ET cancellation) are both treated as unverified.
- **Clock verification (live)**: Bitget `GET /api/v3/reality/market/states` must list a regular session of 09:30–16:00. On 2026-10-02 its `daylightType` was `standard` while New York was on EDT. The disagreement is resolved only when the latest completed reopening in Bitget candles shows a turnover step of at least 5x at the 09:30 ET bar computed from the IANA database. It did, in every checked weekend (23/23 for rNVDA, 17/17 for the others). If that check fails, the current action is disabled.

## 3. Price observations (`candles.ts`, `episodes.ts`)

- Bitget v3 candle rows are `[start, open, high, low, close, baseVolume, quoteTurnover]`. The timestamp is the interval start. Confirmed by the regular-open turnover step falling exactly on the bar starting at 09:30 ET.
- Normalization: numeric validation; the 15-minute grid; unclosed bars (`start + 15m > retrieval time`) removed; invalid OHLC removed; identical duplicates collapsed; conflicting duplicates removed and reported; empty turnover kept as null, never zero.
- Friday reference: close of the bar ending exactly at the weekend start (the bar starting 19:45 ET).
- Canonical decision: close of the bar ending at Sunday 20:00 ET. Each prior weekend is observed at its own Sunday 20:00 ET, which matters on DST weekends of 47 or 49 hours (`signal.ts`, cutoff `CANONICAL`).
- Live decision: the latest closed weekend bar ending at or before the request time. Prior weekends are compared at the same elapsed cutoff after their start, rounded down to 15 minutes (cohort `MATCHED`).
- Reopening price: open of the bar starting at 09:30 ET. Endpoint: close of the bar starting at 10:15 ET. A missing boundary bar excludes the weekend. A display-only fallback (the last earlier weekend close) is shown for excluded rows and never pooled.
- `w = decision / friday_reference - 1`, `g = reopen / decision - 1`, `r = endpoint / decision - 1`. `r` includes the gap and is the comparison target.
- Underlying official close and open (Nasdaq.com) are shown separately. They are never used in `w`, `g` or `r`.

## 4. Turnover denominator H_t (`turnover.ts`)

- Hourly turnover: the sum of four complete 15-minute quote-turnover bars wholly inside the weekend book, on ET clock hours from the weekend start. A missing bar or null turnover makes that hour incomplete.
- Turnover before 2026-07-09 00:00 ET is never used (Bitget changelog: Reality volume and turnover valid from that date).
- Session median: the median of complete hours. A session is eligible only with at least 6 complete hours **[implementation addition, not in the PRD; sensitivity from 1 to 24 hours changes no outcome, see `docs/audit/G2_G3_AUDIT.md` section 5]**, because a median over one or two active hours is not a usable activity proxy.
- H_t: the median of the latest three weekend-session medians completed strictly before the decision. At a canonical decision (which coincides with the weekend's own transition) the evaluated weekend is excluded; this was corrected during the G2/G3 audit, which found it had been included. All three must be eligible; no older session is substituted. Units: USDT per hour.
- Every participation figure is `clip / H_t`.

## 5. Sample and signal (`signal.ts`)

- Prior weekends must have completed (first regular hour ended) strictly before the decision. The evaluated weekend and later weekends are never visible. The unit test `signal-decision.test.ts` corrupts all bars after the decision and asserts identical results.
- Eligible: the four boundaries present, standard and reconciled session, and corporate-action status CLEAR.
- At least 6 eligible weekends are required. Threshold: the 70th percentile of the absolute weekend moves, linear interpolation (Hyndman-Fan type 7).
- Extreme: `|w| > threshold` and `w != 0`. Matched: same sign as `w`, `|w_i| > threshold`. At least 3 are required.
- Median matched `r`: opposite sign to `w` is REVERSAL, same sign is CONTINUATION, zero is INCONCLUSIVE. If fewer than two thirds of the matched `r` values share the median's sign, the sample is CONFLICTING **[implementation addition, not in the PRD; it never applied in this dataset, see the audit]**.

## 6. Hard failures and mapping (`decision.ts`)

Hard failures, all listed on the card:
- not inside the weekend quote window;
- nonstandard weekend (holiday or early close), added during the audit;
- unreconciled switch or unverified clock;
- missing Friday or decision boundary;
- decision bar more than 45 minutes old **[assumption, not an exchange rule]**;
- corporate-action status not CLEAR;
- H_t unavailable;
- fewer than 6 eligible weekends;
- missing limit (BUY_DIP and SELL_POP);
- insufficient holdings;
- limit outside or unverifiable against the band;
- intended clip above 25% of H_t.

Then:

| Intent | Condition | Action |
| --- | --- | --- |
| HOLD | Extreme upward move, REVERSAL | TRIM (sale of up to 25% of the holding) |
| HOLD | Anything else | STAND DOWN |
| BUY_DIP | Extreme downward move, REVERSAL | FADE buy |
| SELL_POP | Extreme upward move, REVERSAL, sufficient holdings | FADE sale of existing holdings |
| BUY_DIP / SELL_POP | Otherwise | STAND DOWN |

The model never selects or alters the action.

## 7. Sizing and order checks (`sizing.ts`)

- Intended clip: 25% of the holding (HOLD) or the trade value (BUY_DIP, SELL_POP). Demo cap: 50,000 USDT.
- Modeled clip: `min(intended, 0.10 * H_t, holding if selling)`. The quantity is floored to the instrument's `quantityPrecision` at the pricing reference (the limit for BUY_DIP and SELL_POP; the decision price for HOLD). It must meet `minOrderQty` and `minOrderAmount`, otherwise STAND DOWN. Unknown precision gives a provisional capacity and no actionable clip.
- Band **[approximate]**: the limit must lie within ±20% of the Friday token reference (Bitget weekend rule) and within the instrument's `buyLimitPriceRatio` or `sellLimitPriceRatio` (0.1 for every candidate) around the decision price. Inside the band does not guarantee acceptance or a fill.

## 8. Costs and comparisons (`accounting.ts`)

- Fee: 0.10% per modeled fill **[assumption]**. Slippage: 5 bps at or below 5% of H_t, 15 bps up to 10%, and no modeled fill above 10% **[assumption]**. Three cases are reported: zero costs, default, and doubled slippage.
- BUY_DIP: a common budget equal to the intended buy. The modeled clip, the full intended buy and no purchase are compared. Each buy and the endpoint liquidation are charged. A full size above the fill model is labeled non-executable and excluded from executable comparisons.
- HOLD and SELL_POP: a common initial holding. Selling the modeled or intended quantity is compared with keeping the holding. Costs apply only to sales that occur. No short position or repurchase is modeled.
- Fills are hypothetical at observed quotes. The limit fill status is UNKNOWN. No limit-fill win rate is produced.
- Slippage in the historical table uses the card's participation tier for every row **[assumption]**.

## 9. Corporate actions (`server/dataset.ts`)

- Primary source: the Bitget AI MCP `do_query equity_fundamental_dividends` (cash dividends, stock splits and stock dividends), with an explicit split-filtered query.
- Labeled fallback, used when the MCP is unreachable: Bitget `GET /api/v3/market/split-records` (exchange-side splits and reverse splits) plus Nasdaq.com dividend history.
- A weekend is AFFECTED when a split takes effect, or an ex-dividend date falls, after the last close and on or before the reopening day. AFFECTED and UNKNOWN weekends are excluded, and an UNKNOWN status on the current weekend disables the action.
- Observed source disagreement: the MCP listed NVDA's September 2026 ex-dividend date as 2026-09-09, while Nasdaq lists 2026-09-10. The MCP value was seen in an unsaved probe response; neither date is a reopening day.

## 9b. Bitget AI tools (`server/mcp.ts`, `server/agent-mcp.ts`)

- **Bitget AI data MCP** (`https://agent.bitget.com/mcp`): primary source for corporate actions and earnings dates (allowlisted `do_query` entries). Since 2026-10-06 its research queries return HTTP 503; failures are kept as receipts and the labeled fallback is used.
- **Bitget Agent Hub MCP** (`@bitget-ai/bitget-agent-mcp` 3.3.1): official local stdio server run with `--read-only` and no credentials; only the public `market` verb with the actions `candles`, `candlesHistory`, `instruments` and `tickers`. The live desk takes its recent 15m bars from `market.candles` (direct v3 is the fallback, labeled in provenance). `npm run agent:crosscheck` makes real calls and checks instrument metadata and the four boundary bars of a verified weekend against the dataset; `evidence:verify` requires every check to pass.
- Catalog or discovery calls are never counted as research integration.

## 10. Scenario (`scenario.ts`)

- The token endpoint implied by the scenario is `underlying_close * (1 + gap) * (1 + basis)`. The gap runs from -20% to +20%, a chosen exploration range only.
- Default basis: the median of `token_reopen / official_open - 1` over prior weekends. It is editable.
- The scenario is disabled when the official close is UNKNOWN. It never changes the historical evidence or the action.

## 11. Language model (`server/model.ts`, `server/llm-provider.ts`)

- Provider and model are configurable (`REANCHOR_MODEL_PROVIDER` = `gemini` (default) or `openai-compatible`; `REANCHOR_MODEL`, default `gemini-3.5-flash-lite`). The model ID is verified against the provider's models endpoint before any job runs; an unlisted model is INVALID and no call is made. Only definitive verification results are cached. Gemini calls use `responseJsonSchema` structured output, temperature 0, and thought parts are ignored. HTTP 429 is not retried: extraction falls back to the structured form, explanation to the case fallback. Verified with real calls on 2026-10-06 (`evidence/model-check.json`). The Anthropic adapter was removed at the owner's request.

- **Job A** (extraction): a schema-validated structured output. Instrument and number fields are post-validated deterministically. Absent fields stay null. User price statements are never treated as market data.
- **Job B** (explanation): input is the facts reduced from the server-computed card (`server/facts.ts`); retrieved text is marked untrusted. Output must be 4 to 6 sentences. Every number must appear in the facts, the computed action must be stated, and emoji or forecast language is rejected. Otherwise the explanation is discarded and the fallback "Case unavailable. Computed results remain available." is shown.
- Results are cached for 6 hours and rate-limited to 20 calls per minute.
