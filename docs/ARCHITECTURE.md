# Reanchor architecture, integrations and verification

Moved from the README to keep it short. Method details: `docs/METHOD.md`. Validation: `docs/VALIDATION.md`. Claims: `docs/CLAIM_LEDGER.md`.

## Decision engine

The engine in `src/domain` is pure and deterministic. The same inputs always give the same card.

**Measurement.** For each weekend: the Friday reference is the close of the 15-minute bar ending at the weekend start; the decision price is the close of the latest closed bar at the decision time (Sunday 20:00 ET in replays); the reopening is the open of the bar starting at 09:30 ET; the endpoint is the close of the bar ending at 10:30 ET. Missing bars are never filled.

**Signal.** Only weekends whose first regular-session hour ended before the decision are visible. At least 6 eligible prior weekends are required. A move is extreme beyond the 70th percentile of their absolute weekend moves. At least 3 same-direction extreme weekends must exist; their median total return decides reversal or continuation, and if fewer than two thirds share the median's sign the sample is conflicting.

**Intent mapping.**

| Intent | Acts only when | Action |
| --- | --- | --- |
| Hold | An extreme weekend rise that prior weekends reversed | TRIM: model selling up to 25% of the holding |
| Buy the dip | An extreme weekend fall that prior weekends reversed | FADE: model a spot buy |
| Sell into a pop | An extreme weekend rise that prior weekends reversed, with enough holdings | FADE: model a sale of tokens you hold |
| Any | Anything else, or any failed check | STAND DOWN, with the reasons |

**Hard failures that force STAND DOWN:** outside a verified weekend session; Bitget closure calendar not reconciled with the NYSE calendar; nonstandard weekend (holiday or early close); session clock not verified; missing Friday reference or decision bar; decision price older than 45 minutes; corporate action not clear; turnover denominator unavailable; fewer than 6 eligible prior weekends; missing limit price or holdings; limit outside the approximate placement band; proposed clip above 25% of H_t.

**Sizing and costs.** H_t is the median of the last three weekend-session medians of hourly quote turnover, each from at least 6 complete hours strictly before the decision. The modeled clip is capped at 10% of H_t, floored to the instrument's precision and minimum order. Costs are assumptions: a 0.10% fee per fill, plus 5 bps of slippage up to 5% participation and 15 bps up to 10%. Whether a weekend limit would have filled is reported as UNKNOWN.

## Bitget AI integration

| Integration | Role in Reanchor | Status |
| --- | --- | --- |
| **Bitget Agent Hub MCP** (`@bitget-ai/bitget-agent-mcp` 3.3.1, official, read-only, no credentials) | Supplies the live desk's 15-minute rToken candles through the MCP `market` tool, and cross-checks the saved dataset | Working. Latest cross-check: 6/6 real calls OK and 6/6 values match the dataset (2026-10-07 00:13 UTC, `data/agent-tool-receipts.json`, earlier runs kept). Verified on the Vercel deployment: live candles come from Agent Hub. |
| **Bitget AI data MCP** (`agent.bitget.com/mcp`) | Intended source for corporate actions and earnings dates | Unavailable on Bitget's side. The server connects and its catalog call succeeds, but every research query returns Bitget's "503 Service Temporarily Unavailable" page (29 recorded probe attempts; latest 2026-10-07 00:51 UTC in `evidence/mcp-probe-log.json`). |
| Bitget public API v3 | Historical 15-minute candles for the verified snapshot; direct fallback for live candles | Working |
| Bitget Reality calendar and market states | Weekend session windows and holiday closures | Working |
| Bitget split records plus Nasdaq.com dividend history | Labeled fallback for corporate actions while the data MCP is down | Working; every card says which source it used |

Agent Hub provides public market data only. Reanchor does not use it, and does not claim to use it, for corporate actions, earnings dates or stock prices.

## Language model role and authority separation

| Job | What the model does | What it cannot do |
| --- | --- | --- |
| Intent extraction (`/api/parse`) | Fills instrument, intent, holding, trade size and limit price from your sentence, and lists ambiguities | Its output schema has no action field. Nothing runs until you confirm the fields. |
| Case explanation (`/api/explain`) | Writes a short explanation of an already computed card | `validateExplanation()` rejects any text that states a different action, uses a number not on the card, or gives a cancellation time. A rejected or failed explanation shows "Case unavailable. Computed results remain available." |

The model is Google Gemini `gemini-3.5-flash-lite`, called server-side with `GEMINI_API_KEY`. HTTP 429 and other failures fall back to the structured form or the case fallback without retries. The UI never says the AI decided anything.

## Reliability and fail-closed behavior

- **Confirmation gate.** Research runs only on a confirmed intention; any edit clears the confirmation.
- **Fail closed.** A missing bar, stale quote, unreconciled calendar, unknown corporate action or unavailable turnover gives STAND DOWN with the reason, never a guess.
- **No substitution.** A failed live source is shown as failed. A token price is never used in place of the stock's official price, and the stock-linked scenario is disabled when the official close is unknown.
- **Labeled fallbacks.** When Agent Hub is unavailable, live candles come from the direct Bitget API and the source says so. When the data MCP is unavailable, corporate actions come from the labeled fallback.
- **Strict chronology.** The cohort and H_t use only data that existed before the decision time; the replayed outcome is revealed afterwards and never used.
- **Receipts.** Agent Hub calls, data MCP probes and refresh attempts are saved with timestamps and content hashes; earlier runs are kept, not overwritten.
- **Synthetic isolation.** Synthetic fixtures live only in `tests/fixtures/`; `npm run evidence:verify` fails if production code imports them or saved data contains synthetic symbols.

## Failure and recovery case studies

Both cases below were observed on this project, not constructed.

### 1. Bitget AI data MCP returns HTTP 503 → labeled corporate-action fallback

Trigger: the pipeline and the desk query the data MCP for corporate actions and earnings dates. The server connects and lists its tools; the research query fails. Latest probe record (`evidence/mcp-probe-log.json`):

```json
{
  "at": "2026-10-07T00:51:09.691Z",
  "connected": true,
  "tools": ["guide", "do_query"],
  "guide": "OK (5 categories)",
  "doQuery": { "outcome": "ERROR", "statusCode": 503 }
}
```

Recovery: corporate actions use Bitget split records plus Nasdaq.com dividend history, labeled "Corporate actions (fallback)" on every card and on `/method#integrations`. Earnings dates are shown as unavailable. The outage is disclosed, not hidden, and the fallback never claims to be MCP data.

### 2. Agent Hub MCP could not start on Vercel → direct API fallback → fixed

Trigger: the first Vercel deployment started the Agent Hub MCP server as a separate Node process, but the deployment bundle did not include that process's own dependencies. The deployed desk reported, on 2026-10-07:

```text
Token 15m candles: OK | Bitget /api/v3/market/candles (direct fallback) | 999 closed bars; Agent Hub MCP unavailable: MCP error -32000: Connection closed
```

Recovery: the live desk kept working on real Bitget data through the labeled direct fallback. The fix in `next.config.ts` computes the Agent Hub package's full dependency closure (93 packages) and ships it with the API routes. Verified locally by starting Agent Hub from only the files the bundle ships, then on the redeployed site:

```text
Token 15m candles: OK | Bitget Agent Hub MCP market.candles (official AI tool, read-only, no credentials) | 999 closed bars
```

## Architecture

```mermaid
flowchart LR
  U[User sentence or form] --> P["/api/parse<br/>Gemini extracts fields"]
  P --> C[Confirmed intention]
  U --> C
  C --> R["/api/research"]
  R --> D["Saved dataset<br/>data/*.json"]
  R --> L["Live inputs<br/>Agent Hub MCP candles<br/>Bitget calendar and states<br/>Nasdaq official prices<br/>corporate-action fallback"]
  D --> E["computeCard()<br/>deterministic engine"]
  L --> E
  E --> K["Decision card<br/>TRIM / FADE / STAND DOWN"]
  K --> X["/api/explain<br/>Gemini explains the computed card"]
  X --> V{"validateExplanation()"}
  V -->|grounded| K
  V -->|rejected| F[Case unavailable fallback]
```

## Repository map

| Component | Source |
| --- | --- |
| Decision engine | `src/domain/decision.ts` (`computeCard`) |
| Signal and cohort | `src/domain/signal.ts`, `src/domain/episodes.ts` |
| Session calendar | `src/domain/calendar.ts`, `src/domain/time.ts` |
| Turnover denominator H_t | `src/domain/turnover.ts` |
| Sizing, costs, scenario | `src/domain/sizing.ts`, `src/domain/accounting.ts`, `src/domain/scenario.ts` |
| Intent validation | `src/domain/intent.ts` |
| Research service | `src/server/service.ts`, `src/server/research.ts` |
| Live inputs | `src/server/live.ts` |
| Agent Hub MCP client | `src/server/agent-mcp.ts` |
| Bitget AI data MCP client | `src/server/mcp.ts` |
| Bitget and Nasdaq adapters | `src/server/bitget.ts`, `src/server/nasdaq.ts`, `src/server/corporate-fallback.ts` |
| Model provider and jobs | `src/server/llm-provider.ts`, `src/server/model.ts`, `src/server/facts.ts` |
| Presentation model | `src/server/presentation.ts` |
| API routes | `src/app/api/parse`, `src/app/api/research`, `src/app/api/explain`, `src/app/api/meta` |
| Desk UI | `src/components/desk/` |
| Public pages | `src/app/page.tsx`, `src/app/how-it-works`, `src/app/method`, `src/app/about` |
| Data pipeline | `scripts/discover.ts`, `scripts/ingest.ts`, `scripts/validate-dataset.ts`, `scripts/build-replay.ts` |
| Audits and verification | `scripts/agent-mcp-crosscheck.ts`, `scripts/mcp-probe.ts`, `scripts/model-check.ts`, `scripts/audit-g2-g3.ts`, `scripts/verify-evidence.ts`, `scripts/audit-all.ts` |
| Saved data | `data/` |
| Run records and evidence | `evidence/` |
| Documentation | `docs/` |

## Verification

| Command | Network | What it checks | Latest result |
| --- | --- | --- | --- |
| `npm run typecheck` / `npm run lint` | None | TypeScript and ESLint | Pass |
| `npm test` | None | 85 Vitest tests across 8 files: calendar, candles, episodes, signal and decision (including TRIM and FADE paths), sizing and accounting, adapters, model validation, provider configuration, site metadata, path redaction | 85 passed |
| `npm run test:e2e` | Live-mode test only | Playwright flows at 1280, 768 and 390 px, plus a five-width desk layout check (1440, 1280, 1024, 768, 390) | 51 passed, 6 deliberately skipped (three tests run at one width only) |
| `npm run evidence:verify` | None | Manifest hashes, recomputation of every saved row, Agent Hub receipts, turnover units, synthetic isolation, emoji and secret scans, client-bundle check | 10 of 10 checks passed |
| `npm run agent:crosscheck` | Bitget Agent Hub MCP | Real read-only Agent Hub calls compared with the saved dataset | 6/6 calls OK, 6/6 values match |
| `npm run mcp:probe` | Bitget AI data MCP | Single availability probe, appended to `evidence/mcp-probe-log.json` | HTTP 503 on research queries |
| `npm run model:check` | Model provider | Verifies the configured model and makes one tiny real call | Verified |
| `npm run audit:g2g3` | None | Episode-level audit and sensitivity runs | Pass |
| `npm run audit:all` | All of the above | Runs every check in gate order and writes `evidence/audit-run.json` | 12 of 12 steps passed (2026-10-07 00:13 UTC) |

Data pipeline commands: `npm run data:discover`, `npm run data:ingest`, `npm run data:mcp`, `npm run data:validate`, `npm run data:replay`. They never overwrite a valid snapshot with a failed run.

## Deployment

The app is a standard Next.js server app (Node.js runtime, no Edge routes) and is deployed on Vercel from this repository.

- **Runtime files.** Pages and API routes read `data/*.json` and three evidence files at runtime. `next.config.ts` lists them in `outputFileTracingIncludes`, together with the Agent Hub MCP package and its dependencies for the API routes; screenshots are excluded. Nothing is written to disk at runtime; caches are in memory.
- **Environment.** Set `GEMINI_API_KEY` and `REANCHOR_SITE_URL` in the Vercel project, then redeploy.
- **Data refresh.** Run the pipeline scripts locally and commit the results; the deployed app never ingests.
