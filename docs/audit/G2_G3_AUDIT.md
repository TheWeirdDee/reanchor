# G2 and G3 audit

Audit date: 2026-10-03. Data: the snapshot pulled 2026-10-02 21:11 to 21:24 UTC, plus raw Bitget responses in `data/raw/`. Reproduce with `npm run audit:g2g3` and `npm run net:diagnose`.

Every statement below is tagged with its evidence class:

| Tag | Meaning |
| --- | --- |
| **T** | Implementation verified by tests |
| **X** | Verified against real external data |
| **B** | Product behavior observed in the browser |
| **U** | Blocked or unvalidated |

## 1. Session times and cancellation

Four times are kept separate in code (`WeekendSession.startMs`, `transitionMs`, `reopenMs`, and the card's `cancellation`) and in the UI.

### 1.1 Weekend matching start: Friday 20:00 ET

- **Source:** Bitget support article 12560603892041, FAQ 2, verbatim in the saved copy `evidence/sources/bitget-support-12560603892041.html` (retrieved 2026-10-06; it was quoted by the fetch tool on 2026-10-02): "Opening Time: Summer Time (DST): Opens every Saturday at 08:00 (UTC+8). Winter Time (Standard Time): Opens every Saturday at 09:00 (UTC+8)." Both equal Friday 20:00 in New York. (A re-fetch on 2026-10-03 failed while `www.bitget.com` was unreachable; the raw HTML was saved on 2026-10-06.)
- **Instrument scope (resolved 2026-10-06):** the saved article (`evidence/sources/bitget-support-12560603892041.html`, published 2026-08-14) is titled "Bitget Adds 24/7 Trading Support for 14 New rTokens Including rBB and rISRG", and its FAQ 1 states that "only selected popular US stock assets (such as AAPL, TSLA, NVDA, etc.) are available for weekend trading". FAQ 2 adds: "The moment after-hours trading ends on Friday, the system automatically switches to the weekend trading session." Instrument-level evidence for rNVDA remains `GET /api/v3/reality/market/stock-info?symbol=RNVDAUSDT` (requestTime 1790975476267): `"weekendTradable":"yes"`. **X**
- **Corroboration:** weekend-book bars begin at the Friday 20:00 ET bar with fractional platform sizes; for example, the rNVDA bar starting 2026-09-26 00:00Z (Friday 20:00 EDT) traded 1.4491 tokens for 326.06 USDT, against 19,174.70 tokens in the preceding 19:45 bar. **X**
- **Status:** documented (verbatim in the saved source).

### 1.2 End of weekend-only quotes and start of the weekday overnight session: Sunday 20:00 ET (inferred)

- `GET /api/v3/reality/market/states` (requestTime 1790975473780, 2026-10-02T21:11:13Z): `stateList` includes `{"state":"overnight","timeZone":"EST","startTime":"20:00","endTime":"04:00"}`, with no weekday attached. `market: "US"`; the endpoint is market-wide, not per instrument. **X**
- `GET /api/v3/reality/market/calendar` (requestTime 1790975475008, 2026-10-02T21:11:15Z): `regularConfig: ["SATURDAY","SUNDAY"]` (closure days, no times) and `specificConfig` holiday windows `2026-06-18 20:00 to 2026-06-19 20:00`, `2026-07-02 20:00 to 2026-07-03 20:00`, `2026-09-06 20:00 to 2026-09-07 20:00`. Market-wide. **X**
- Candles (`history-candles`, RNVDAUSDT 15m, page retrieved 2026-10-02T21:12:50.778Z):

  | Bar start (UTC) | Row | Note |
  | --- | --- | --- |
  | 2026-09-27 23:45 | `["1790552700000","223.55","223.55","223.55","223.55","0.6774","151.43277"]` | Last bar before Sunday 20:00 EDT |
  | 2026-09-28 00:00 | `["1790553600000","225.12","225.47","224.91","225.44","29819","6715010.67"]` | First bar after: integer share volume, turnover about 44,000x |

  The same step appears in every boundary-complete weekend. **X**
- **Conclusion:** the weekday overnight session's hours are documented, but its first weekday is not. That weekend-only quoting ends at Sunday 20:00 ET is an inference from three consistent sources. It is not a documented single statement. **Status: inferred.**
- **Use in the engine:** the canonical historical decision (Sunday 20:00 ET, from the PRD) and the end of the live weekend decision window. It is not used as a cancellation time.

### 1.3 Regular US cash-market open: 09:30 ET on the next trading day (verified)

- `states`: `{"state":"regular","timeZone":"EST","startTime":"09:30","endTime":"16:00"}`. **X**
- NYSE holiday calendar (nyse.com, read 2026-10-02) gives the next trading day. **T** (calendar tests, including DST and holidays)
- Candles: the bar starting at the IANA-computed 09:30 ET carries at least 5x the preceding hour's turnover in 23/23 rNVDA weekends and 17/17 for each other symbol. For 2026-09-28: `["1790602200000","229.56","233.21","229.4975","232.225","21460787.446502","4974822843.76"]` (13:30Z = 09:30 EDT), against 187,336,032 USDT in the 13:15Z bar. **X**
- **Discrepancy:** `daylightType: "standard"` was reported on 2026-10-02, while New York was on EDT. The candle step occurs at 13:30Z (EDT), not 14:30Z. The engine verifies this live before allowing an action. **X** (live run 2026-10-03 07:05Z: "Resolved by candle evidence: turnover stepped up 51x".)

### 1.4 Cancellation of unfilled weekend limits: timing not verified

- **Documented rule** (support article 12560603892041, FAQ 13, verbatim in the saved copy retrieved 2026-10-06): "Unfilled limit orders placed during the weekend will be automatically canceled when the system switches back to regular trading on Monday's US stock market open."
- **What is not established:**
  - Whether "Monday's US stock market open" means the start of the overnight session (Sunday 20:00 ET, which is Monday 08:00 UTC+8) or the 09:30 ET cash open.
  - (Resolved 2026-10-06: the saved article names NVDA among weekend-tradable assets, so the rule's scope covers rNVDA. The timing remains unverified.)
  - What happens on holiday Mondays ("the opening time may be postponed").
  - Price and candle changes cannot show order cancellation, and no order was placed to test it.
- **Correction made:** the card no longer shows a cancellation timestamp. It shows "Cancellation timing not verified", quotes the rule and its source, and lists the observed transition and the cash open as separate facts. Model explanations that attach a clock time to cancellation are now discarded (`validateExplanation`). **T, B** (after the rerun in section 6)

## 2. Episode counts reconciled (rNVDA)

The full table is in `docs/audit/RNVDA_EPISODES.md` (generated; also `evidence/audit/rnvda-episodes.json`).

| Count | Value | Definition |
| --- | --- | --- |
| Weekend rows | **23** | Weekend sessions (Saturdays 2026-04-25 to 2026-09-26) whose first regular hour ended before the last ingested bar (2026-10-02 20:30Z). |
| Price-complete | **13** | Bars exist at all four boundaries: Friday 20:00 bar end, Sunday 20:00 bar end, 09:30 open, 10:30 bar end. The 10 earlier weekends lack the Sunday 20:00 bar. Before 2026-06-20 there is no weekend trading at all (191 or 192 of 192 weekend intervals empty); on 2026-07-11 and 2026-07-25 the Sunday 19:45 bar is missing. |
| Cohort-eligible | **10** | Price-complete, standard Friday-to-Monday, closure calendar reconciled, corporate actions CLEAR. Excluded from the 13: 2026-06-20 (Juneteenth), 2026-07-04 (Independence Day observed) and 2026-09-05 (Labor Day). This is the "10 price-complete weekends" figure in earlier reports, more precisely 10 cohort-eligible weekends. |
| Evaluated | **4** | Cohort-eligible weekends with at least 6 cohort-eligible weekends completed before their own decision: 2026-08-29 (6 prior), 2026-09-12 (7), 2026-09-19 (8), 2026-09-26 (9). The first six eligible weekends (06-27, 07-18, 08-01, 08-08, 08-15, 08-22) are warm-up. |
| Replay rows | **69** | 23 weekends x 3 intents x 1 instrument. |

The three intents are three readings of the same 23 market weekends, not independent observations. Independent market observations: 23 weekends, of which 4 were evaluated.

## 3. Final actions and stand-down causes (canonical, reference inputs)

Every one of the 69 replay rows is STAND DOWN. For the 4 evaluated weekends the cause is identical across intents:

| Weekend | w | Threshold | Matched extreme | H_t used | Signal | Cause |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-29 | +0.09% | 0.93% | 1 | 3,360 | INSUFFICIENT | Move not extreme |
| 2026-09-12 | -0.59% | 0.75% | 1 | 5,551 | INSUFFICIENT | Move not extreme |
| 2026-09-19 | -0.09% | 0.63% | 1 | 9,367 | INSUFFICIENT | Move not extreme |
| 2026-09-26 | -0.64% | 0.61% | 1 | 4,474 | INSUFFICIENT | Inadequate sample (1 matched, minimum 3) |

Classification across the 4 evaluated weekends:
- non-extreme move: 3;
- inadequate matched sample: 1;
- missing turnover: 0;
- stale data: 0 (replays observe the bar ending exactly at the decision);
- conflict threshold: 0;
- genuinely inconclusive or continuation direction: 0;
- sizing limit: 0.

The 19 non-evaluated weekends stand down for inadequate history (fewer than 6 prior), missing boundaries, missing turnover, sizing (the 500 USDT reference clip above 25% of H_t on 2026-08-01, 2026-08-08 and 2026-08-15), and, for holiday weekends, the nonstandard-weekend rule. Per-weekend reasons are listed in `RNVDA_EPISODES.md`.

## 4. Turnover around 2026-07-09

`evidence/audit/turnover-coverage.json`:

| Weekend | Starts | Before validity date | Weekend bars present | Bars with a turnover value | Complete hours ignoring the date rule | Canonical complete hours |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-20 | Thu 06-18 20:00 | yes | 142/288 | 142 | 7 | 0 (excluded) |
| 2026-06-27 | Fri 06-26 20:00 | yes | 132/192 | 132 | 13 | 0 (excluded) |
| 2026-07-04 | Thu 07-02 20:00 | yes | 104/288 | 104 | 2 | 0 (excluded) |
| 2026-07-11 | Fri 07-10 20:00 | no | 148/192 | 148 | 23 | 23 |
| 2026-07-18 | Fri 07-17 20:00 | no | 140/192 | 140 | 18 | 18 |
| 2026-07-25 | Fri 07-24 20:00 | no | 134/192 | 134 | 15 | 15 |
| 2026-08-01 | Fri 07-31 20:00 | no | 132/192 | 132 | 15 | 15 |

- Bitget's changelog says Reality volume and turnover became valid on 2026-07-09, and earlier values "may be empty".
- In this pull, no bar has an empty turnover value (0 null-turnover bars for every symbol). Pre-July-9 values are present but their validity is not established, so the engine ignores turnover before 2026-07-09 00:00 ET by date. **T, X**
- Missing bars (no row returned) are never counted as zero; an hour with any missing bar is incomplete. **T**
- **Effect on results:** none on the evaluated weekends. The date rule removes H_t only for the 2026-07-25 decision. Its prior sessions would have been 07-18, 07-11 and 07-04, and 07-04 has only 2 complete hours even without the date rule, so H_t would still be missing. That weekend also lacks a Sunday 20:00 bar and has only 2 prior eligible weekends.

## 5. Added assumptions and sensitivity

Two thresholds were added by the implementation and are not in the PRD:

| Assumption | Canonical value | Where |
| --- | --- | --- |
| Minimum complete hourly groups per weekend session for H_t | 6 | `turnover.ts MIN_COMPLETE_HOURS` |
| Directional agreement: a matched sample is CONFLICTING if fewer than this share of matched `r` values share the median's sign | 2/3 | `signal.ts AGREEMENT_MIN` |

Sensitivity runs (`evidence/audit/sensitivity.json`, kept separate from canonical results):
- The grid covers minimum complete hours of 1, 3, 6, 12 and 24, each with the agreement rule on (2/3) and off (0).
- Every case gives the same outcome: 4 evaluated weekends per intent, 0 actions, causes 3 x non-extreme move and 1 x inadequate sample.
- The agreement rule never applied, because no evaluated weekend reached 3 matched episodes.
- At 24 hours, before the H_t correction below, the 2026-09-26 decision lost H_t because the then-included own session had only 13 complete hours. That is how the correction was found.

**Conclusion:** STAND DOWN in this dataset comes from the absence of extreme weekend moves and from too few matched extremes. It does not come from the added assumptions, missing turnover or stale data.

## 6. Corrections made in this audit

1. **H_t used the evaluated weekend's own session (canonical methodology bug, corrected).** `computeHt` selected sessions with `transitionMs <= t`; at the canonical decision `t` equals the weekend's own transition. It now uses `transitionMs < t`, consistent with the PRD ("completed ... before decision time t") and with live mid-weekend decisions. A test was added.

   Effect on H_t (USDT/h) at the canonical decision:

   | Weekend | Before | After |
   | --- | --- | --- |
   | 07-25 | 1,399 | missing |
   | 08-01 | 1,399 | 1,399 |
   | 08-08 | 1,767 | 1,399 |
   | 08-15 | 2,330 | 1,767 |
   | 08-22 | 3,360 | 2,330 |
   | 08-29 | 5,551 | 3,360 |
   | 09-05 | 5,551 | 5,551 |
   | 09-12 | 9,367 | 5,551 |
   | 09-19 | 4,474 | 9,367 |
   | 09-26 | 3,927 | 4,474 |

   Actions are unchanged (all STAND DOWN).
2. **Nonstandard current weekends are now a hard failure.** Before, a holiday weekend whose Bitget closure window reconciled (for example 2026-09-05, reopening Tuesday) could reach the directional checks. It now stands down with "Nonstandard weekend (holiday or early close)". This removes actions only. A test was added.
3. **The cancellation timestamp was removed;** see 1.4.
4. **Field names** `switchMs`, `switchStatus` and `BETWEEN_SWITCH_AND_OPEN` were renamed to `transitionMs`, `calendarStatus` and `BETWEEN_TRANSITION_AND_OPEN`, so that the closure-calendar reconciliation is not presented as a verified switch.
5. **The two added thresholds are injectable** for audit runs only; canonical defaults are unchanged.

## 7. G2 and G3 findings

**G2 (instruments, history, provenance).**
- Instrument identity for all 7 candidates is verified against Bitget responses (X).
- Candle semantics are verified: the interval start is confirmed by the 09:30 step, and quote units by turnover/volume falling inside the bar range for 99.9% of bars (X).
- Normalization, duplicates and missing data are verified by tests (T).
- Coverage supports rNVDA only. Integrity counts: 0 conflicting duplicates, 0 invalid OHLC, 0 unclosed bars kept.
- Unvalidated:
  - weekday candle volume mirrors the whole US market (21.46 million NVDA shares in the 09:30 bar), so weekday candle turnover is not Bitget platform activity. H_t uses weekend-book bars only.
  - redistribution terms (U).

**G3 (sessions, calendar, episodes).**
- The calendar, DST and boundary logic are verified by tests (T). The regular-open boundary is verified against real data (X).
- The weekend-to-overnight transition is inferred (X, not documented).
- **Cancellation timing is unverified (U).** The engine and UI no longer claim it.
- Bitget's calendar lacks Memorial Day 2026 and future holidays, so those weekends are UNRECONCILED.
