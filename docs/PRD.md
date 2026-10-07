# Reanchor PRD

Bitget AI Base Camp Hackathon S2  
Track: AI Trading Desk; use the exact current submission dropdown label.  
Sub-theme: Decision Stress Testing.  
Revision: 2, October 2, 2026. Scope locked; data feasibility and submission schedule require verification.

This is the build contract. Do not reopen ideation unless a kill criterion fires. No commits, pushes, publication, social posting or form submission without explicit user authorization. Saving local evidence is required and does not authorize a commit.

## 1. Product

Reanchor stress-tests one weekend decision for a Bitget rToken holder before regular US trading resumes. The user states the name, intended action, USDT size and proposed limit. The desk retrieves relevant historical weekends, measures the move from the decision price through the first regular-session hour, applies transparent sizing rules, and returns one action the human chooses whether to take.

The sponsor-native decision point is the weekend session switch: Bitget says unfilled weekend limits are canceled when regular trading resumes. Weekend prices are indicative exchange prices, not current Nasdaq or NYSE transactions. The approximate ±20% restriction is an order-placement control relative to the session reference; it is not a guaranteed price or loss boundary.

One sentence: Reanchor stress-tests a weekend rToken trade against prior reopenings, sizes the proposed clip, and explains what happens to the limit at the session switch.

Exact user: a Bitget spot holder or buyer of supported rTokens, roughly $5,000–$50,000 of capital, trading a few times a month and unable to watch the next US open. This segment is a product hypothesis, not an observed user count. Candidate names: rNVDA, rTSLA, rAAPL, rMSFT, rAMZN, rMETA and rQQQ. The supported list must come from verified instruments and history.

Value primitive: DECIDE. A completed task is a confirmed intention → source-backed stress test → one compatible action, maximum modeled clip and cancellation warning. No order is sent.

## 2. Differentiation and evidence boundaries

The public hub features Nocturne and NightDesk. The supplied NightDesk README describes a broad fair-value/safety gateway, a model council, risk gates and signed execution evidence. Reanchor must demonstrate a narrower session-switch task, not reproduce that architecture.

NightDesk reports a 49.6% corrective rate in its broader convergence test and cautions about ticker volume and weekend execution. These are its reported results, not current platform facts or evidence for Reanchor. They motivate direct data verification and honest cost modeling. Re-anchoring does not establish profitable fading.

Do not claim competitors are absent, a prize is likely, or a strategy edge exists without evidence. Do not reuse a verifier/refusal engine as the product. The desk's distinguishing work is the session-specific historical comparison and user-intent mapping.

## 3. Falsifiable claims

Primary product hypothesis: the desk helps the intended user correctly understand reopening exposure, feasible modeled size and order cancellation faster than consulting separate chart and rule pages.

Secondary research hypothesis: for some extreme weekend moves, an intent-compatible fade or trim improves the modeled outcome versus the user's full-size proposed action after costs. Test this; do not assume it.

Every result must distinguish observed market data, assumed fills/costs, historical modeled outcomes, hypothetical scenarios and user-study observations. A losing baseline comparison is displayed. If the evidence supports continuation rather than reversal, the desk explains that and does not recommend a fade.

## 4. Sponsor data and feasibility gate

Before UI work, discover the current SPOT instruments, preserve their exact case-sensitive symbols and identifiers, and verify Reality/rToken identity. Do not infer instrument identity from a similar name.

Use the documented v3 endpoints as the starting path:

- `GET /api/v3/market/candles`
- `GET /api/v3/market/history-candles`
- `category=SPOT`, verified symbol, `type=market`.

The current documentation lists rToken intervals including 1m, 5m, 15m, 1H, 4H and 1D. Verify actual responses and pagination; documented history availability is not proof that every symbol has that history. Do not assume the v2 1H retention limit determines the v3 dataset.

Pull 15m data where available for exact session boundaries. Preserve raw responses, retrieval time, endpoint, parameters, units and earliest/latest closed bars. Check duplicate timestamps, missing bars, incomplete candles, instrument launch dates, weekend coverage and quote turnover. No fabricated prices or volume; missing is not zero. Bitget's changelog says Reality candle volume/turnover became valid July 9, 2026 and older values may be empty without backfill. Verify positive usable turnover for each decision window. Do not use ticker `usdtVolume` as a substitute.

Load-bearing AI tool integration: use the read-only `bitget-mcp-server` at `https://agent.bitget.com/mcp` to retrieve relevant underlying-stock reference/history or corporate-action information. Discover actual tools and schemas; do not invent tool names or assume a tool supplies official session prices. Save a real tool-call receipt and use its returned information in the research flow. Validate exchange, currency, timestamp, adjusted/unadjusted status and whether a price is official regular-session data. If not established, label the anchor UNKNOWN.

The MCP is described as keyless. Verify reachability and returned capabilities. A working relevant Agent Hub market operation can serve as an alternative Bitget AI tool integration, but it must materially contribute and be demonstrated. A raw HTTP price call alone is market integration, not evidence of AI tool use. Signal is optional only when it answers a real research question; no decorative integrations.

Fallback stock anchor: an independently verified stock-data source may be used, clearly attributed, but does not replace the AI integration requirement. If the underlying feed fails, show UNKNOWN and never substitute the token or a blended stock perpetual for the underlying.

If spot weekend data is unavailable, stop and report the failed gate. Switching to a perpetual requires a revised product contract: do not carry spot cancellation or order-band claims across instruments.

## 5. Experience and presentation

Public landing page, separate desk and method/evidence page. No login or user API key. Mobile-first functional flow. No emoji anywhere in UI, generated cases, documentation or handoff output. Use `lucide-react` icons with accessible labels where useful.

Landing headline: Stress-test your weekend rToken trade before the US market reopens.

Subcopy: Compare your intended action with prior reopenings, check modeled size, and see when Bitget cancels an unfilled weekend limit.

Primary CTA: Open the desk. Explain who it serves, show one real sourced example once available, describe the finished task and link the method. Do not place invented performance numbers or a fabricated winning screenshot on the landing page. Do not cut landing usability to make the deadline; reduce secondary features first.

Desk flow:

1. Type an intention, such as “I hold $3,000 of rNVDA and want to check whether to trim,” or use the structured form.
2. The LLM extracts only instrument, intent, USDT amount and proposed limit if stated. Missing or ambiguous fields remain blank. User assertions about prices or moves are not market data.
3. Show editable extracted fields. Explicitly confirm the structured intention before calculating. Holdings size and proposed trade size are separate fields.
4. Choose one supported intent: HOLD, BUY_DIP or SELL_POP. No FOLLOW action in v2; a trend-entry intent is out of scope.
5. Enter a proposed absolute USDT-per-token limit for BUY_DIP or SELL_POP. HOLD trim modeling uses the observed decision price and is labeled hypothetical. Cap demo amounts at 50,000 USDT, require positive finite values, and validate the instrument precision.
6. Press Stress-test my decision. Render computed numbers first and the model explanation when available.

One result screen shows: session and next regular reopening; observation time and data mode; Friday reference; current/weekend decision price; underlying Friday official close and reopening anchor if printed; extreme-move threshold; eligible historical sample; intent-compatible action; intended versus modeled clip; hourly turnover denominator; cancellation warning; limit-band status; costs and limitations.

Below the card: “Stress test against prior reopenings,” historical rows, baseline comparison and replay control. Each row includes decision timestamp/price, reopening price if available, end-of-first-hour price, gap, total reopening return, eligible prior count and costs.

Scenario panel: vary the underlying reopening gap from −20% to +20% relative to the underlying Friday close. This is a chosen hypothetical stress range, not Bitget's order band or a worst-case bound. Show an editable token-versus-stock basis assumption and token endpoint implied by it. No probability, execution claim or change to the historical action. If the anchor/basis cannot be established, disable the stock-linked calculation with a clear explanation. Never mix scenarios into observed metrics.

Required states: loading, empty, ambiguous intent, missing limit, missing turnover, stale data, unknown anchor, tool failure and case unavailable. Historical snapshots carry their timestamp and cannot be presented as live recommendations. Outside the weekend session, provide completed replay and session information; do not call stale weekend observations current.

## 6. Deterministic decision and measurement rules

### Session calendar

Use America/New_York with a verified US exchange calendar, daylight saving, holidays and early closes. The typical regular session is 09:30–16:00 ET. The typical weekend book starts after Friday 20:00 ET and ends at the next actual regular-session reopening. Do not assume Monday is open on a holiday. Reconcile the clock with Bitget market-state/calendar data when available; unresolved disagreement disables current action and marks the next switch UNKNOWN.

Exclude nonstandard holiday/early-close episodes from the primary historical cohort until the Bitget reference and switch are verified. Preserve excluded episodes and reasons. Never fabricate holiday bars.

### Price observations and alignment

Candle timestamps identify interval starts; confirm this from source semantics. Use only closed bars. A Friday reference is the close of the 15m bar ending exactly at Friday 20:00 ET, not the close of a bar starting at 20:00. Missing exact boundary means exclude the episode from the primary metric; a weaker fallback may be displayed but never silently pooled.

Canonical historical decision time: Sunday 20:00 ET. Decision price is the close of the 15m bar ending at that time. This is a sampled quote, not the literal last transaction before the switch. All features and turnover must be available by that timestamp.

Reopening price is the open of the 15m bar starting at the verified regular-session opening. Endpoint price is the close of the 15m bar ending 60 minutes after that opening. For a standard session these are 09:30 and 10:30 ET. No 1H approximation in headline results: hour-aligned candles miss the half-hour opening boundary.

Weekend move `w = decision_price / friday_reference − 1`.

Reopening gap `g = reopening_price / decision_price − 1`.

Total reopening return `r = endpoint_price / decision_price − 1`. This total, including the gap, is the trade comparison target and historical reversal/continuation signal. Underlying-stock prices are shown separately; do not mix token and stock returns.

Current weekend checks use the latest verified closed 15m price and display its timestamp. Matched historical comparisons use the same elapsed weekend cutoff rounded down to a 15m boundary. Sunday 20:00 headline results remain a separate fixed cohort. Do not present Sunday outcome probabilities as evidence for a Saturday decision. If matched history is unavailable, show descriptive canonical replay and STAND DOWN.

### One turnover denominator

Define `H_t`: for each of the latest three completed weekend sessions available before decision time t, compute the median hourly quote turnover by summing four complete 15m quote-turnover bars per hour wholly inside that weekend session; then take the median of those three session medians. Units: USDT per hour. Require all three eligible sessions, valid turnover units and complete hourly groups. Missing H_t means STAND DOWN.

Every participation percentage uses `proposed_clip / H_t`, including hard limits, cap, slippage and UI examples. H_t is a historical activity proxy, not executable depth. No “Sunday turnover” denominator elsewhere.

For HOLD, proposed clip is 25% of the entered holding value. For BUY_DIP/SELL_POP it is the entered trade value. SELL_POP also requires available holding quantity/value and cannot sell more than held. No shorting.

### Historical sample and signal

At t, training episodes must have ended before t; never include the evaluated episode or any later episode. Require at least six eligible completed same-instrument episodes. Compute the 70th percentile of their absolute weekend moves using a documented linear-interpolation method. Extreme means `abs(w) > threshold` and w is nonzero.

Select same-sign historical episodes above that historical threshold. Require at least three matching episodes for a directional conclusion. Their median total reopening return r determines REVERSAL when opposite to w, CONTINUATION when the same sign, otherwise INCONCLUSIVE. Display the matching count and uncertainty. Sparse or conflicting samples produce STAND DOWN; never claim statistical significance from these thresholds.

### Priority and intent mapping

Apply hard failures first: not a verified weekend session; unverified switch; stale decision feed by more than 45 minutes; missing required boundary/history/turnover/precision; fewer than six eligible episodes; missing limit for an entry/sale; insufficient holdings; proposed limit outside the verified approximate band; or proposed clip greater than 25% of H_t. Any gives STAND DOWN with reasons. The 45-minute freshness threshold is a product assumption, not an exchange rule.

Then require extreme move and at least three matched cases. Map intent deterministically:

| Intent | Signal and move | Action |
| --- | --- | --- |
| HOLD | Extreme upward move with REVERSAL | TRIM: model selling up to 25% of stated holding |
| HOLD | Any other state | STAND DOWN: no modeled trade; holding remains exposed |
| BUY_DIP | Extreme downward move with REVERSAL | FADE: model a spot buy |
| SELL_POP | Extreme upward move with REVERSAL, sufficient holdings | FADE: model a spot sale of existing holdings |
| BUY_DIP / SELL_POP | CONTINUATION, INCONCLUSIVE or incompatible direction | STAND DOWN |

No overlapping actions. STAND DOWN means do not place the proposed trade; it does not imply an existing holding has zero risk.

Modeled clip: `min(proposed_clip, 0.10 * H_t, available_holdings_value_if_selling)`. Floor quantity to verified instrument precision and check minimum notional; a zero/below-minimum clip means STAND DOWN. If H_t is positive but precision is unknown, show a provisional capacity number and no actionable clip.

The approximate order band is checked against the verified token session reference, separately from the underlying stock anchor. If exact current placement limits are unavailable, label approximate. A price inside the band does not guarantee exchange acceptance or a fill.

### Costs, fills and comparisons

Default fee assumption: 0.10% per modeled fill, explicitly labeled and replaceable by verified rToken fees. Slippage assumption per fill: 5 bps at participation ≤5% of H_t; 15 bps above 5% through 10%. No modeled fill above 10%. These are sensitivity assumptions, not empirically validated execution estimates. Report zero, default and doubled-slippage outcomes separately.

For unfilled limit possibilities, report exposure/conditional outcome and fill UNKNOWN. OHLC touching a limit is insufficient to prove execution. No limit-fill PnL or trading win rate without defensible fill evidence. Primary quote-based comparisons use the observed decision quote and endpoint, with explicit hypothetical execution labels.

BUY_DIP: compare modeled buy clip with full-size intended buy and zero new purchase. Report token quantity, cash used and endpoint wealth on a common initial budget, charging each modeled buy and endpoint liquidation. If the full-size action exceeds the fill model, label its quote benchmark non-executable and exclude it from an executable performance comparison.

SELL_POP/HOLD: compare selling the proposed/capped quantity with keeping the same initial holding. Report cash proceeds plus marked endpoint holding value, subtracting costs on actual modeled sales. No fictitious short position or repurchase. Keep this accounting separate from buy round trips.

An always-follow research benchmark may be shown only as a separate analytical comparator: buy a positive move; sell existing holdings on a negative move. No synthetic shorting; use the same budget, exposure and costs, with participation exclusions. Primary product comparison remains the user's intended action versus no proposed trade. Do not merge distinct intents into one strategy equity curve.

## 7. LLM contract

The model has two substantive jobs: extract the user's intention into a validated schema, and explain the computed evidence, retrieved anchor/context and historical comparison. Deterministic code selects cohorts, calculates numbers, chooses action and sizes the clip.

The parser never converts a user-stated price into authoritative data. It returns null for absent fields, rejects unsupported instruments/intents, and requests confirmation through the editable form. Structured input remains available if the parser fails.

The case writer receives computed card JSON and provenance-bearing tool results, not unrestricted instructions from retrieved text. Four to six sentences: state the chosen action and side; explain the relevant historical comparison and sample count; describe size/assumptions; state the cancellation rule; identify missing anchor or execution evidence. No invented news, probabilities, prices, holdings, performance or emojis. Validate numerical statements against the card; discard ungrounded cases. Fallback: “Case unavailable. Computed results remain available.”

Use any available suitable model; Qwen is optional and its absence does not affect judging per the supplied guide. Record actual model/version and jobs performed. Never invent usage or credentials. Rate-limit and cache case generation; keep keys server-side.

## 8. Architecture and evidence

One repo, ingest process and web app. No database, accounts, order path or trading keys. Server-side read-only MCP adapter for tool discovery and relevant research calls; structured market-data adapter for token candles; deterministic domain modules; model adapter for extraction/explanation.

Snapshots make historical replay resilient to rate limits. They never impersonate live data. Publish only verified source data permitted for redistribution; retain raw source receipts locally if redistribution terms prohibit inclusion. Store credentials outside the repository.

Required artifacts:

- `README.md`: user task, runnable demo, proof, setup, limitations.
- `docs/METHOD.md`: measurement, timing, intent mapping, costs and exclusions.
- `docs/CLAIM_LEDGER.md`: each displayed claim mapped to source/calculation.
- `docs/DATA_GATE.md`: instrument, boundaries, turnover and tool feasibility results.
- `docs/VALIDATION.md`: observed usability results or labeled plan.
- `docs/SUBMISSION.md`: exact current fields, links and unresolved schedule checks.
- `data/raw/`, `data/bars.json`, `data/weekends.json`, `data/manifest.json`, `data/tool-receipts.json` with provenance and redistribution handling.
- Public demo URL after authorized deployment.

Manifest records pull time, source, symbol, granularity, timestamp semantics, units, coverage, missing bars, exclusions and data mode. Every displayed number must reproduce from its receipt and code version. Saving a snapshot never overrides the no-commit rule.

## 9. Validation and honest reporting

Historical report per instrument and intent: available weekends, eligible evaluation weekends after warm-up, matched extreme episodes, exclusions, decisions, stand-down frequency, modeled wealth difference versus intended action and no proposed trade, costs and sensitivity. Do not call historical simulations observed returns or infer trading profitability from gap correction rates.

Headline eligibility: at least eight chronologically evaluated episodes after warm-up for an instrument/intent. Otherwise display exploratory rows only and no headline success rate. Eight is a reporting minimum, not a statistical adequacy claim. Seven correlated tech names are not seven independent experiments; report distinct weekend dates and cross-name dependence plainly. Avoid pooled confidence claims.

Use expanding-window chronological evaluation, predeclared rules and one instrument held out of manual rule tuning. Log any tuning; freeze the rule before evaluating the holdout. With inadequate untouched data, state that holdout validation is unavailable. Removing the model must leave calculations/actions unchanged; removing parsing and explanation should change the user workflow, which usability testing measures.

Small usability study target: five people plausibly matching the segment, if recruitable. Give each the same sourced task: identify the action, modeled size, cancellation timing and one limitation. Measure completion rate, elapsed time, comprehension and errors; compare with chart plus rule page, counterbalancing order if feasible. Report participant fit and recruitment limitations. No invented people, fabricated tasks completed or mislabeled developer checks. If unavailable, publish the protocol as planned and label observed user metrics unavailable.

Distribution: a clearly labeled initial target and concrete channel to holders, not fabricated traction. Real spending, trading volume and Qwen use are not entry prerequisites in the supplied guide. Product validation still matters to score.

## 10. Submission and schedule

Working submission date: October 8, 2026, based on the September 24 official @Bitget_AI extension post. Exact cutoff hour/timezone and revised voting/results dates remain UNCONFIRMED. The hub shows September 21 and the supplied guide September 27 plus internally conflicting voting dates. Do not reuse their October 8 winner date as a confirmed revised date. Internal ship target: October 7, 18:00 WAT; this is our buffer, not an official deadline. Check the current official post, form and organizer announcements before submission and record source/time. Do not message organizers or submit without authorization.

Track: AI Trading Desk; match the current form. Sub-theme: Decision Stress Testing. Required materials: accessible demo and complete question-to-insight task. No autonomous execution log or Alpha Factory 60-day backtest is required for this track in the supplied guide.

Write the six-part description in the form itself: thesis; exact user/value; validation and labeled metrics/distribution; progress/tool failures; deliverables; optional AI trading perspective. Repo links do not replace this answer. Separately explain actual LLM roles and model names.

Required X promotion: substantive project introduction, `#BitgetHackathon`, `@Bitget_AI`, and quote the specified official post `https://x.com/Bitget_AI/status/2100519318824055159`. Confirm the current form's requirement before posting. No compliant X post, no complete description or inaccessible materials means invalid entry under the supplied guide.

University: enter the full university name if genuinely eligible as a student/club/campus entrant; a campus team is not required. Never invent enrollment. The university award is mutually exclusive with Grand/Theme/Open. Fan Favorite can stack; Best Spread is unavailable after a main-track prize. Demo Day interest is separate and open to all teams. K3 opt-in and Qwen build credits are separate optional programs, not promised cash.

X draft, to update after build with truthful capabilities: “Weekend rToken prices are not the next US open. Reanchor stress-tests an intended buy or sale against prior reopenings, shows modeled size, and explains Bitget's weekend-limit cancellation rule. Human decides. #BitgetHackathon @Bitget_AI”

## 11. Build order and acceptance gates

Day 1: verify instruments, 15m boundary coverage, usable turnover, calendar and one relevant real Bitget AI tool call. Save receipts; report pass/fail before proceeding to directional claims.

Day 2: implement splitter, closed-bar handling, canonical/matched cutoffs, one denominator and chronological features. Test gap inclusion and exact 09:30/10:30 boundaries, DST, holiday exclusions, missing bars and corrupt future data having no effect on prior decisions.

Day 3: implement intent mapping, holdings checks, limit input/band, precision, costs and wealth comparisons. Verify every action/side, participation boundaries and no shorting or invented fills. Build one true card and historical table.

Day 4: read-only tool integration, natural-language extraction/confirmation, grounded case/fallback and scenario panel. Test ambiguity, unsupported instruments, malicious retrieved instructions and model/tool outages.

Day 5: finished landing, desk and method pages; replay controls; mobile/keyboard/error-state checks; evidence links and available usability sessions. Label every snapshot, assumption and sparse cohort.

Day 6: reconcile calculations, record a 90-second complete task, prepare form/X text, verify revised schedule and fresh-browser access. Deployment/publication requires user authorization; make the result reviewable first.

Day 7/buffer: wrong numbers, broken flow and dead links only. If time is short, cut optional Signal/context, scenario sophistication or extra instruments before the core research flow, provenance or landing usability. Do not weaken data gates to fill the screen.

## 12. Kill and downgrade criteria

- No verified spot weekend prices: stop the spot-native product; no silent perpetual fallback.
- Weekend quotes but no usable turnover: keep descriptive stress research; remove actionable clip, mark liquidity sizing unavailable and STAND DOWN. Do not claim the full product is finished.
- No exact reopening boundary history: no headline reopening/PnL metric; use clearly labeled exploratory information only.
- Fewer than six eligible episodes or three matched extremes: no directional action; show insufficient evidence.
- No eight eligible post-warm-up evaluations: no headline success rate; label exploratory research.
- Holdout/cost sensitivity defeats the fade claim: remove that claim; retain honest session research if the user task is useful.
- No working relevant Bitget AI tool: integration gate remains failed; fix it or disclose the weaker entry.
- Only a chatbot or rule explainer finished: product gate failed; do not describe it as a completed Reanchor desk.

## 13. Limitations and security

Corporate actions can invalidate price comparisons. Verify splits/reverse splits and adjusted-price consistency; exclude affected or unresolved episodes rather than pooling them as ordinary moves. Unknown corporate-action status disables directional evidence for affected data until resolved. Underlying and token can retain basis after reopening; never promise instant parity.

Indicative quotes, turnover proxies, assumed costs and unknown fills limit what the replay establishes. Historical resemblance is not a probability forecast. Holding after STAND DOWN remains risky. Scenario ranges are chosen examples and are not maximum losses. Keep these explanations adjacent to relevant numbers, not buried in legal copy.

No orders are sent. Keep secrets out of browser bundles/logs, validate model output, restrict adapters to read-only methods and set request timeouts. Numbers inconsistent with evidence are bugs that block release.

## 14. Judging alignment and source register

The supplied guide lists AI Trading Desk judging as feature depth (data sources/Skill integration count and effectiveness), research quality, LUI fluency and personalized thesis; scoring is subjective, without published numeric weights. The first three project-description parts carry most weight. This PRD prioritizes effective relevant integration, a finished research task and measurable comprehension. It does not predict prize odds.

Sources used to set requirements, checked/read October 2, 2026:

- Official hub: https://www.bitget.com/activity-hub/hackathon
- Official extension post: https://x.com/Bitget_AI/status/2103047860602495198 — indexed announcement confirms October 8; exact cutoff remains unresolved.
- Submission form: https://forms.gle/GyWZCMCPocgJdJon6 — current fields/options require final verification.
- Required quote-post target: https://x.com/Bitget_AI/status/2100519318824055159
- Bitget support weekend rules: https://www.bitget.com/support/articles/12560603892041
- Market data: https://www.bitget.com/docs/catalog/market/market-data
- Reality guide: https://www.bitget.com/docs/uta/reality-trading-guide
- Turnover changelog: https://www.bitget.com/legacy-docs/uta/changelog
- Read-only US stock MCP: https://agent.bitget.com/mcp
- Supplied attachments: Base Camp Hackathon S2 EN; NightDesk README; Agent Hub guide. Source copies establish what they say, not that every described tool/data claim has been tested in this build.

Resolved changes in v2: total reopening measurement; 15m boundaries; single turnover denominator; compatible actions; limit/holdings inputs; chronological replay; holidays/corporate actions; real AI research integration; user validation; sparse/correlated sample disclosure; scenario isolation; corrected award rules; no-emoji/no-commit instructions. Remaining uncertainty is explicit verification work, not permission to invent evidence.
