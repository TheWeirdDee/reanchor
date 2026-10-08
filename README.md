# Reanchor

**A weekend quote. A Monday decision.**

Reanchor checks whether one weekend rToken trade is supported by what happened at prior US market reopenings. You state your position and what you are considering; it compares the current weekend move with prior weekends of the same rToken, sizes the trade against real weekend activity, and returns one rule-based action with every number sourced. It sends no orders. You decide.

Built for the Bitget AI Base Camp Hackathon S2, track AI Trading Desk, sub-theme Decision Stress Testing.

| | |
| --- | --- |
| Live app | [reanchor-nine.vercel.app](https://reanchor-nine.vercel.app) |
| Desk | [reanchor-nine.vercel.app/desk](https://reanchor-nine.vercel.app/desk) |
| Method and evidence | [reanchor-nine.vercel.app/method](https://reanchor-nine.vercel.app/method) |

## Demo

[Watch the 98-second walkthrough](https://www.youtube.com/watch?v=C0t3rhKuGpo) (1920x1080, narrated with captions). It starts from a fresh intention and shows, on the real product: extraction, confirmation, the historical stress test, the deterministic action and why it was taken, the decision-time boundary and the later outcome, sources, live Bitget data through the Agent Hub MCP, and the disclosed data MCP outage. Nothing in it is mocked.

## How it works

**AI understands language. Data establishes what happened. Deterministic rules decide what the evidence permits. Provenance shows where each number came from. You decide whether to trade.**

1. **Describe.** "I hold 2,000 USDT of rNVDA and want to check whether to trim." Google Gemini extracts instrument, intent, holding, trade size and limit price. That is all it does.
2. **Confirm.** The extracted fields are shown next to your sentence and stay editable. Nothing runs until you confirm.
3. **Stress-test.** Deterministic code selects the prior weekends that finished before the decision, measures each one from the Friday reference to the Sunday decision quote, the 09:30 ET reopening and the 10:30 ET first-hour end, applies fixed thresholds, and sizes the trade against weekend turnover.
4. **Decide.** One action, TRIM, FADE or STAND DOWN, with the answer to four questions: what you asked, what was compared, what was found, and which rule decided. If you choose to act, an **Open on Bitget** link opens Bitget's own spot page for that rToken (for example [rNVDA](https://www.bitget.com/spot/RNVDAUSDT)) in a new tab. Reanchor passes no order or amount; you log in and place any trade yourself.

The model never chooses the action, the size or the evidence. Without it, the form and every computed result still work.

```text
Your sentence
     |
     v
AI extraction (Gemini) ------> fields only: instrument, intent, holding, trade size, limit
     |
     v
Your confirmation (editable; nothing runs before it)
     |
     v
+---------------------------------------------------------------+
| Deterministic engine (src/domain)                             |
| saved and live Bitget candles -> prior weekends before the    |
| decision -> weekend move vs 70th percentile -> matched count  |
| vs 3 required -> intent mapping -> sizing vs turnover -> costs |
+---------------------------------------------------------------+
     |
     v
Decision card: action, reason, sources and timestamps
     |
     v
AI explanation (checked against the card; discarded if any number or the action differs)
     |
     v
Your decision. No order is sent.
```

| The AI does | The AI does not |
| --- | --- |
| Understand your sentence | Choose the action |
| Extract instrument, intent, holding, trade size and limit price | Select the prior weekends compared |
| List ambiguities and unsupported requests | Calculate moves, thresholds or sizes |
| Explain the already computed card in plain words | Supply or alter any price or data |
| | Place, route or execute any order |

## A real example

Replay of the weekend after Friday 25 September 2026 (rNVDA, Hold, 2,000 USDT holding), decided as of Sunday 20:00 ET:

| | Value |
| --- | --- |
| Weekend move | 225.00 → 223.55 USDT (-0.64%), beyond the extreme threshold of 0.61% |
| Compared against | 9 eligible prior weekends (13 excluded, each with a reason) |
| Comparable extreme weekends | **1 found, 3 required** |
| Decision | **STAND DOWN**: not because the market is safe, but because the evidence threshold is not met |
| Revealed afterwards, never used | Reopened 229.56 USDT (+2.69%); first-hour end 231.27 USDT (+3.45%) |

One weekend is not a track record, and the reveal does not show that standing down was right.

## Evidence policy

Reanchor does not fabricate market data, historical observations, fills, user-study results, model usage, credentials, performance or traction. Missing evidence is shown as UNKNOWN, unavailable, or a STAND DOWN with the reason. Historical snapshots are labeled as replays and never presented as live data. A failed source is shown as failed, and a fallback is always labeled as one. Every saved weekend and evaluation row is recomputed from the raw bars by `npm run evidence:verify`.

## Current status (7 October 2026)

| Area | Status |
| --- | --- |
| Deterministic engine and historical replay | Working; 93 unit tests and 52 browser checks pass |
| Evidence verification and full audit | Passing; `audit:all` 12 of 12 steps |
| Live Bitget market data (Agent Hub MCP) | Working; verified on the deployed site |
| Bitget AI data MCP (corporate actions, earnings) | Degraded on Bitget's side: HTTP 503; labeled fallback in use |
| Natural-language extraction and explanation (Gemini) | Working; optional, the form works without it |
| Live decision inside an open weekend session | Not yet observed |
| User study | Not yet run |
| Order placement and live trading | Intentionally unsupported; the decision card links to Bitget's own spot page, where you place any order yourself |

## Evidence so far

- 7 candidate rTokens verified; **rNVDA** is the only one with enough weekend history.
- 69 replay rows (23 weekends x 3 intents), 4 chronologically evaluated weekends, **0 trade suggestions**. Below the 8 weekends needed for any headline rate. **No trading edge is claimed.**
- Bitget's official **Agent Hub MCP** supplies live 15-minute candles; 6 of 6 real calls matched the saved dataset.
- The **Bitget AI data MCP** connects but answers research queries with HTTP 503 on Bitget's side. This is disclosed; corporate actions use a labeled fallback (Bitget split records plus Nasdaq.com dividend history).
- `npm run evidence:verify` recomputes every saved row from the raw bars; `npm run audit:all` runs every check (12 of 12 passed on 2026-10-07).

## Run it

```bash
npm install
cp .env.example .env.local   # optional: GEMINI_API_KEY for natural-language input and explanations
npm run build && npm run start
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Natural-language extraction and explanations (server-side only) |
| `REANCHOR_SITE_URL` | Public https origin for canonical links, sitemap and social image; set before building |

All variables are server-side. Bitget needs no credentials; every call is public and read-only. Tests: `npm test` (unit), `npm run test:e2e` (browser), `npm run evidence:verify`, `npm run audit:all`.

## Limitations

- Weekend rToken prices are indicative Bitget quotes, not Nasdaq transactions.
- Samples are small and recent; minimum counts are reporting floors, not statistical significance.
- Turnover is an activity proxy, fees and slippage are assumptions, and limit fills are UNKNOWN.
- Cancellation timing of unfilled weekend limits is not verified; only Bitget's rule is documented.
- A live decision inside an open weekend session has not yet been observed; live mode is verified outside the session, where it stands down.
- No orders, accounts or keys exist in this codebase. No user study has been run yet.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Decision engine rules, Bitget AI integration, model boundary, failure and recovery cases, architecture diagram, repository map, verification, deployment |
| [`docs/METHOD.md`](docs/METHOD.md) | Measurement, sessions, turnover, signal and sizing method |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Chronological evaluation and checks |
| [`docs/CLAIM_LEDGER.md`](docs/CLAIM_LEDGER.md) | Every public claim, its value, source and classification |
| [`docs/DATA_GATE.md`](docs/DATA_GATE.md) | Instrument coverage and data gate |
| [`docs/PRD.md`](docs/PRD.md) | The product specification (canonical) |
