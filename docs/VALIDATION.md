# Validation

This file keeps three kinds of evidence apart: historical research results, developer and browser checks, and user-study results. **No user-study results exist.** No participant has been recruited or contacted.

## 1. Historical research (rNVDA, chronological)

Protocol (`scripts/build-replay.ts`, output `data/evaluations.json`):
- Expanding window. Each weekend is decided at its Sunday 20:00 ET using only weekends whose first regular hour had ended.
- Rules come from the PRD and were fixed before any results were produced. Tuning log: empty; no rule was changed after viewing results. The two product assumptions (6 complete hours per turnover session; the two-thirds conflict rule) were set before evaluation.
- Reference inputs, declared in code before evaluation: HOLD with a 2,000 USDT holding; BUY_DIP of 500 USDT; SELL_POP of 500 USDT from a 2,000 USDT holding. Limits sit at the decision quote.
- Holdout: rQQQ was designated as the instrument held out of manual review. It does not meet the data gate, so **holdout validation is unavailable** in this build.

Results:

| Intent | Evaluated after warm-up | Extreme moves | Extreme with 3+ matches | Actions | Stand-downs | Intended vs no trade, default costs (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| HOLD | 4 | 1 | 0 | 0 | 4 | -14.71 USDT |
| BUY_DIP | 4 | 1 | 0 | 0 | 4 | -0.31 USDT |
| SELL_POP | 4 | 1 | 0 | 0 | 4 | -14.71 USDT |

Evaluated weekends: 2026-08-29, 2026-09-12, 2026-09-19 and 2026-09-26. Episode-level detail and count reconciliation: `docs/audit/G2_G3_AUDIT.md` and `docs/audit/RNVDA_EPISODES.md`. After the audit's H_t correction the outcomes are unchanged. The only extreme move (2026-09-26, `w` = -0.64% against a 0.61% threshold) had 1 matched prior episode, so the desk stood down.

Interpretation:
- **No headline.** Fewer than 8 evaluated weekends, so no success rate or fade claim is made. The secondary research hypothesis (an intent-compatible fade or trim improves on the full-size action after costs) is **untested**: no fade or trim was ever triggered.
- **Losing baseline shown.** The user's full intended trim or sale lost to keeping the holding (sum -14.71 USDT at default costs, -17.71 with doubled slippage). The full intended buy roughly broke even after costs (-0.31 USDT).
- **Executable subset.** The "modeled vs intended" sums in `evaluations.json` cover only the 2 weekends where the full intended size was executable under the fill model (`intendedExecutableWeekends`).
- **Correlation.** With one supported name there is no cross-name pooling. Future multi-name reports must treat same-date weekends as one observation.

## 2. Developer and browser checks (not user research)

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Unit and adapter tests | `npm test` | 80 passed |
| Browser flows at 1280, 768 and 390 px | `npm run test:e2e` | 49 passed, 2 deliberately skipped (natural-language test runs on desktop only) |
| Evidence reproduction and scans | `npm run evidence:verify` | 10/10 checks pass |
| Production build and server | `npm run build && npm run start` | Pass |
| Live weekend run, 2026-10-03 around 05:00 UTC | `POST /api/research` mode `live` | Ran on real data; STAND DOWN because the latest rNVDA weekend bar was 48 to 60 minutes old |

Screenshots of the implemented screens: `evidence/screenshots/`.

## 3. Usability study protocol (planned, not run)

- **Participants:** five people who plausibly match the segment. They hold or have bought Bitget rTokens or comparable tokenized stocks, trade a few times a month with roughly 5,000 to 50,000 USDT, and cannot watch the US open. Recruitment channel: to be authorized by the project owner; no one has been contacted.
- **Task (identical for all, using a fixed sourced replay):** "You hold 3,000 USDT of rNVDA on the weekend of 2026-09-25. Using the tool, find (1) the action, (2) the modeled size, (3) what Bitget's rule says about unfilled weekend limits and whether its timing is verified, and (4) one limitation of the evidence."
- **Conditions:** (A) Reanchor desk; (B) a Bitget candle chart plus the Bitget weekend-rules support page. Counterbalanced order: participants 1, 3 and 5 do A then B; participants 2 and 4 do B then A, each with a different weekend for the second condition (2026-09-18).
- **Measures:**
  - completion of all four items;
  - elapsed time;
  - comprehension score (0 to 4, scored against the card's computed values);
  - errors (for example, treating a STAND DOWN as "safe", or stating a cancellation time as fact);
  - participant-fit notes.
- **Reporting:** raw per-participant rows, with recruitment limits and fit stated. No aggregate claim with fewer than five completed sessions.
- **Status:** PLANNED. Observed user metrics: unavailable.

## 4. Distribution target (planned)

- **Initial target:** Bitget rToken holders active on weekends.
- **Channel:** the required hackathon X post, plus a reply-thread walkthrough of one sourced replay.
- No traction has been observed or claimed.
