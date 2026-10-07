# Data gate

Pull: discovery 2026-10-02T21:11Z; ingest finished 2026-10-02T21:24:26Z; corporate fallback refreshed 2026-10-02T21:31Z. Data mode: SNAPSHOT for history, LIVE for current weekend checks.

## 1. Instruments

All seven PRD candidates exist as Bitget v3 SPOT instruments. Each has `isReality=yes`, `symbolType=stock` and `status=online`, and Reality stock-info returns the matching underlying code with `weekendTradable=yes`. Evidence: `data/instruments.json`, raw `data/raw/discovery/`.

| Base coin | Symbol | Underlying | Launch (instrument `launchTime`) | Precision (price/qty) | Min notional | Limit ratio |
| --- | --- | --- | --- | --- | --- | --- |
| rNVDA | RNVDAUSDT | NVDA | 2026-04-23 | 2 / 4 | 10 USDT | 0.1 |
| rTSLA | RTSLAUSDT | TSLA | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |
| rAAPL | RAAPLUSDT | AAPL | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |
| rMSFT | RMSFTUSDT | MSFT | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |
| rAMZN | RAMZNUSDT | AMZN | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |
| rMETA | RMETAUSDT | META | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |
| rQQQ | RQQQUSDT | QQQ | 2026-06-01 | 2 / 4 | 10 USDT | 0.1 |

Similar-looking instruments (rQQQI, rIQQQ, rSQQQ, rTQQQ, rQQQM) are different products and are not used.

## 2. Candles

- Endpoint: `GET /api/v3/market/history-candles?category=SPOT&symbol=<exact>&interval=15m&type=market&startTime&endTime&limit=100` (max 100 rows per call, max 90-day range per call). Paged in 25-hour windows at 8 requests/second (documented limit 20/s/IP).
- Live: `GET /api/v3/market/candles` (up to 1000 rows).
- Row fields, confirmed by docs and data: `[start ms, open, high, low, close, base volume, quote turnover]`. Quote turnover divided by base volume falls inside the bar's price range for 99.9% of bars (`quoteTurnoverUnitCheck`), confirming USDT quote units.
- Integrity: 0 conflicting duplicates, 0 identical duplicates, 0 invalid OHLC, 0 off-grid bars, 0 unclosed bars kept. Null turnover: 0 bars. Zero turnover: 4 to 13 bars per symbol (kept as zero, distinct from missing).

| Symbol | First closed bar | Last closed bar | Bars | Missing 15m intervals |
| --- | --- | --- | --- | --- |
| RNVDAUSDT | 2026-04-23 03:15Z | 2026-10-02 20:30Z | 12,758 | 2,864 |
| RTSLAUSDT | 2026-06-01 14:15Z | 2026-10-02 20:30Z | 9,677 | 2,157 |
| RAAPLUSDT | 2026-06-01 14:00Z | 2026-10-02 20:30Z | 9,135 | 2,700 |
| RMSFTUSDT | 2026-06-01 14:00Z | 2026-10-02 20:30Z | 8,761 | 3,074 |
| RAMZNUSDT | 2026-06-01 14:00Z | 2026-10-02 20:30Z | 8,576 | 3,259 |
| RMETAUSDT | 2026-06-01 14:00Z | 2026-10-02 20:30Z | 8,831 | 3,004 |
| RQQQUSDT | 2026-06-01 14:00Z | 2026-10-02 20:30Z | 9,433 | 2,402 |

Most missing intervals lie inside the weekend book. Bitget prints no bar when no weekend trade occurs, and these gaps are treated as missing.

## 3. Weekend boundaries and turnover

Weekend-book bars are essentially absent before the weekend of 2026-06-20; before then 191 or 192 of 192 weekend intervals are missing. Coverage per symbol (`data/validation-report.json`):

| Symbol | Weekends seen | Boundary-complete standard weekends | Turnover-eligible sessions (>= 6 complete hours, after 2026-07-09) | Status |
| --- | --- | --- | --- | --- |
| rNVDA | 23 | 10 | 12 | **Supported** |
| rQQQ | 18 | 7 | 1 | Unsupported: H_t would always be missing |
| rTSLA | 18 | 5 | 4 | Unsupported: too few boundary-complete weekends |
| rMETA | 18 | 5 | 1 | Unsupported |
| rAAPL | 18 | 1 | 1 | Unsupported |
| rMSFT | 18 | 1 | 0 | Unsupported |
| rAMZN | 18 | 1 | 0 | Unsupported |

rNVDA weekend H_t session medians run from about 1,267 to 24,400 USDT per hour. The H_t used at the 2026-09-26 replay decision is 4,474 USDT per hour (sessions 09-19, 09-12, 09-05). Before the G2/G3 audit correction it was 3,927 because the weekend's own session was wrongly included.

Kill and downgrade criteria applied:
- **Spot weekend prices exist**, so the spot product continues. There is no perpetual fallback.
- **Instruments with quotes but unusable turnover** are not offered on the desk, and the reason is shown.
- **Fewer than 8 post-warm-up evaluations**, so results are exploratory and no headline rate is reported.

## 4. Session boundaries

- Regular open: in every checked weekend (rNVDA 23/23, all others 17/17), the bar starting at the IANA 09:30 ET instant has at least 5x the turnover of the preceding hour. This confirms both the interval-start semantics and EDT, despite Bitget `daylightType: standard`.
- Observed transition (not a cancellation time): the bar starting at Sunday 20:00 ET jumps from tiny fractional weekend trades to integer-share overnight volume (for example, the 2026-09-27 weekend: 151 USDT in the last weekend bar, 6.7 million USDT in the first overnight bar). Candle changes cannot show when orders are cancelled; cancellation timing is not verified (`docs/audit/G2_G3_AUDIT.md` 1.4).
- Bitget calendar closures: Juneteenth (2026-06-18 20:00 to 06-19 20:00), Independence Day observed (07-02 to 07-03), Labor Day (09-06 to 09-07). Memorial Day 2026 is missing from Bitget's list, so that weekend is UNRECONCILED and excluded. Future holidays (Thanksgiving, Christmas) are not yet listed by Bitget; a live decision on those weekends would be UNRECONCILED.

## 5. Underlying anchor

- Nasdaq.com historical quotes (`api.nasdaq.com/api/quote/<T>/historical`) give official daily open and close in USD (91 to 120 sessions per ticker). Example: NVDA closed at 225.07 on 2026-09-25 and opened at 229.75 on 2026-09-28, against the token's 225.00 Friday reference and 229.56 reopening open.
- The Bitget AI MCP `equity_price_quote` returned an IEX-sourced quote whose `prev_close` (231.49) did not match the official 2026-10-01 close (230.86). It carries no timestamp and no official-session flag, so it is not used as an official anchor. `equity_price_historical` returned HTTP 204 with no data for every parameter form tried.

## 6. Bitget AI tool feasibility

Failure identified on 2026-10-03 (`npm run net:diagnose`, `evidence/network-diagnostics.json`): no proxy configured (environment, npm, WinHTTP and WinINet all direct); the system resolver times out for every `*.bitget.com` name while resolving other domains; public DNS returns 104.18.8.145 and 104.18.9.145 for `agent.bitget.com` and `www.bitget.com`, and TCP connect to both times out after 8 s; IPv6 is unroutable on this network (`ENETUNREACH`). `api.bitget.com` (104.18.14.166 and 15.166) completes TCP and TLS 1.3 and serves HTTP. The failing stage for the MCP host is therefore TCP connect over IPv4, not DNS, TLS, HTTP or MCP. Routing those hostnames to other edge addresses was deliberately not attempted.


- `https://agent.bitget.com/mcp` answered over Streamable HTTP on 2026-10-02 at about 13:14 UTC: `serverInfo bitget-mcp-server 4.0.5`, tools `guide` and `do_query`. The catalog includes equity quote, historical prices, dividends and splits, the earnings calendar, fundamentals, ownership, estimates, ETF data, news and sentiment. Raw probe files: `evidence/mcp-probe-2026-10-02/`.
- Relevant, working entries during the probe: `equity_fundamental_dividends`, `equity_calendar` and `equity_price_quote`. Not working: `equity_price_historical` (HTTP 204).
- After the build machine moved to a mobile hotspot, `agent.bitget.com` (104.18.8.145, 104.18.9.145, and IPv6) became unreachable at TCP connect, and `www.bitget.com` also failed. `api.bitget.com` and Nasdaq.com remained reachable. Integrated runs are recorded in `data/tool-receipts.json` under `attempts`. **Status: BLOCKED by network**; see `docs/GATES.md`.

Update 2026-10-06: the TCP path to `agent.bitget.com` is open again; the MCP handshake and catalog call succeed, but every research `do_query` returns HTTP 503 (receipts in `data/tool-receipts.json`, attempts in `evidence/mcp-probe-log.json`).

## 6b. Bitget Agent Hub MCP (2026-10-06)

The official Agent Hub MCP server (`@bitget-ai/bitget-agent-mcp` 3.3.1, run locally with `--read-only`, no credentials) answered 6/6 real public market calls. Instrument metadata for RNVDAUSDT matched (isReality yes, symbolType stock, quantity and price precision, minimum notional and quantity, limit ratios), and the 2026-09-26 weekend boundary bars matched exactly: Friday reference 225, Sunday decision 223.55, reopening open 229.56, first-hour endpoint 231.27. Its `history-candles` call returns the bars before `endTime`, so single bars are requested with `endTime` set to the bar start plus 15 minutes. Its catalog has no Reality calendar, split-record, corporate-action or underlying-stock operations. Receipts: `data/agent-tool-receipts.json`.

## 7. Redistribution

Bitget and Nasdaq redistribution terms were not verified. `data/raw/` is git-ignored and retained locally. Derived JSON in `data/` contains exchange prices; review the terms before any public deployment.
