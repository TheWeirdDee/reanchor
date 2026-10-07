/**
 * Replay generation and historical validation (runs entirely against saved data; no network).
 * Expanding-window chronological evaluation with predeclared reference inputs.
 * Outputs: data/weekends.json, data/evaluations.json; updates data/manifest.json hashes.
 */
import { join } from "node:path";
import { canonicalElapsed, observe } from "../src/domain/episodes";
import { sessionHourlyTurnover } from "../src/domain/turnover";
import { INTENTS, type ConfirmedIntention, type Intent } from "../src/domain/intent";
import { loadDataset, episodesFor } from "../src/server/dataset";
import { allSessionsFor, replayCard } from "../src/server/research";
import { DATA, log, readJson, sha256File, writeJsonAtomic } from "./lib/fsx";

/**
 * Reference inputs, declared before evaluating results (docs/VALIDATION.md).
 * Limits sit at the observed decision quote so that the band check is neutral.
 */
export const REFERENCE_INPUTS: Record<Intent, { holdingUsdt: number | null; tradeUsdt: number | null }> = {
  HOLD: { holdingUsdt: 2000, tradeUsdt: null },
  BUY_DIP: { holdingUsdt: null, tradeUsdt: 500 },
  SELL_POP: { holdingUsdt: 2000, tradeUsdt: 500 },
};
/** Held out of manual rule review. Rules come from the PRD and were not tuned on any instrument. */
export const HOLDOUT_SYMBOL = "RQQQUSDT";
export const HEADLINE_MIN_EVALUATIONS = 8;

function main() {
  const ds = loadDataset();
  const weekends: Record<string, unknown[]> = {};
  const evaluations: Record<string, unknown> = {};
  const crossName: Record<string, { symbol: string; intent: Intent; action: string }[]> = {};

  for (const inst of ds.supported) {
    const idx = ds.bars[inst.symbol];
    const sessions = allSessionsFor(ds, inst, idx.last!);
    const episodes = episodesFor(ds, inst, sessions).filter((e) => e.completedAtMs <= idx.last! + 15 * 60_000);
    weekends[inst.symbol] = episodes.map((e) => {
      const ob = observe(e, idx, canonicalElapsed(e));
      const t = sessionHourlyTurnover(e.session, idx);
      return {
        key: e.key,
        lastTradingDay: e.session.lastTradingDay,
        nextTradingDay: e.session.nextTradingDay,
        startMs: e.session.startMs,
        transitionMs: e.session.transitionMs,
        reopenMs: e.session.reopenMs,
        endpointMs: e.session.endpointMs,
        standard: e.session.standard,
        calendarStatus: e.session.calendarStatus,
        fridayRef: e.fridayRef,
        decisionPrice: ob.decisionPrice,
        reopenPrice: e.reopenPrice,
        endpointPrice: e.endpointPrice,
        w: ob.w,
        g: ob.g,
        r: ob.r,
        underlying: e.underlying,
        corporateAction: e.corporateAction,
        turnover: { completeHours: t.completeHours, totalHours: t.totalHours, medianHourlyUsdt: t.medianHourlyUsdt, eligible: t.eligible, reason: t.reason },
        exclusions: [...e.baseExclusions, ...ob.exclusions],
        fallback: ob.fallbackPrice !== null ? { price: ob.fallbackPrice, barEndMs: ob.fallbackBarEndMs } : null,
      };
    });

    const perIntent: Record<string, unknown> = {};
    for (const intent of INTENTS) {
      const rows: Record<string, unknown>[] = [];
      for (const e of episodes) {
        const ob = observe(e, idx, canonicalElapsed(e));
        const ref = REFERENCE_INPUTS[intent];
        const intention: ConfirmedIntention = {
          symbol: inst.symbol,
          intent,
          holdingUsdt: ref.holdingUsdt,
          tradeUsdt: ref.tradeUsdt,
          limitPrice: intent === "HOLD" ? null : ob.decisionPrice,
        };
        const { card } = replayCard(ds, intention, e.key);
        const def = card.realized?.comparisons.find((c) => c.costCase === "DEFAULT") ?? null;
        rows.push({
          key: e.key,
          evaluable: card.signal.eligibleCount >= 6 && card.observation.decisionPrice !== null && e.baseExclusions.length === 0,
          action: card.action,
          side: card.side,
          signal: card.signal.signal,
          threshold: card.signal.threshold,
          w: card.observation.w,
          r: card.realized?.r ?? null,
          extreme: card.signal.extreme,
          eligiblePrior: card.signal.eligibleCount,
          matched: card.signal.matchedCount,
          ht: card.ht.value,
          proposedParticipation: card.sizing.proposedParticipation,
          modeledClipUsdt: card.action === "STAND_DOWN" ? 0 : card.sizing.modeledClipUsdt,
          standDownReasons: card.standDownReasons,
          realized: card.realized?.comparisons.map((c) => ({
            costCase: c.costCase,
            modeledVsNoTrade: c.modeledVsNoTrade,
            modeledVsIntended: c.modeledVsIntended,
            intendedVsNoTrade: c.intended.endpointWealth - c.noTrade.endpointWealth,
            intendedExecutable: c.intended.executable,
          })) ?? [],
          defaultModeledVsNoTrade: def?.modeledVsNoTrade ?? null,
        });
        if (card.action !== "STAND_DOWN") (crossName[e.key] ??= []).push({ symbol: inst.symbol, intent, action: card.action });
      }
      const evaluated = rows.filter((r) => r.evaluable);
      const acted = evaluated.filter((r) => r.action !== "STAND_DOWN");
      const sum = (cc: string, f: "modeledVsNoTrade" | "modeledVsIntended" | "intendedVsNoTrade") =>
        evaluated.reduce((s, r) => {
          const c = (r.realized as { costCase: string; [k: string]: unknown }[]).find((x) => x.costCase === cc);
          const v = c?.[f];
          return typeof v === "number" ? s + v : s;
        }, 0);
      perIntent[intent] = {
        referenceInputs: REFERENCE_INPUTS[intent],
        availableWeekends: rows.length,
        evaluatedAfterWarmup: evaluated.length,
        extremeEpisodes: evaluated.filter((r) => r.extreme).length,
        matchedExtremeWithAtLeast3: evaluated.filter((r) => r.extreme && (r.matched as number) >= 3).length,
        actions: acted.length,
        standDowns: evaluated.length - acted.length,
        standDownFrequency: evaluated.length ? (evaluated.length - acted.length) / evaluated.length : null,
        headlineEligible: evaluated.length >= HEADLINE_MIN_EVALUATIONS,
        /** modeledVsIntended sums only these weekends (full intended size executable under the fill model). */
        intendedExecutableWeekends: evaluated.filter((r) => (r.realized as { costCase: string; intendedExecutable: boolean }[]).find((c) => c.costCase === "DEFAULT")?.intendedExecutable).length,
        wealthDifferenceUsdt: Object.fromEntries(
          ["ZERO", "DEFAULT", "DOUBLE_SLIPPAGE"].map((cc) => [cc, { modeledVsNoTrade: sum(cc, "modeledVsNoTrade"), modeledVsIntended: sum(cc, "modeledVsIntended"), intendedVsNoTrade: sum(cc, "intendedVsNoTrade") }]),
        ),
        rows,
      };
    }
    evaluations[inst.symbol] = { baseCoin: inst.baseCoin, holdout: inst.symbol === HOLDOUT_SYMBOL, intents: perIntent };
    log(`${inst.baseCoin}: ${episodes.length} weekends replayed`);
  }

  writeJsonAtomic(join(DATA, "weekends.json"), { generatedAt: new Date().toISOString(), canonicalDecision: "Sunday 20:00 ET", weekends });
  writeJsonAtomic(join(DATA, "evaluations.json"), {
    generatedAt: new Date().toISOString(),
    method: "Expanding-window chronological evaluation; each weekend decided with only episodes completed before its Sunday 20:00 ET decision",
    referenceInputs: REFERENCE_INPUTS,
    holdoutSymbol: HOLDOUT_SYMBOL,
    tuningLog: [],
    headlineMinEvaluations: HEADLINE_MIN_EVALUATIONS,
    crossNameActionsByWeekend: crossName,
    evaluations,
  });
  const manifestPath = join(DATA, "manifest.json");
  const manifest = readJson<{ files: Record<string, string> }>(manifestPath);
  for (const f of ["weekends.json", "evaluations.json"]) manifest.files[f] = sha256File(join(DATA, f));
  writeJsonAtomic(manifestPath, manifest);
  log("Replay generation complete.");
}

main();
