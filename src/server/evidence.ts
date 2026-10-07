import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./dataset";

/** Read-only access to saved evidence files for server-rendered pages. */
function read<T>(f: string): T | null {
  const p = join(DATA_DIR, f);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}

export interface WeekendRow {
  key: string;
  lastTradingDay: string;
  nextTradingDay: string;
  startMs: number;
  transitionMs: number;
  reopenMs: number;
  endpointMs: number;
  standard: boolean;
  fridayRef: number | null;
  decisionPrice: number | null;
  reopenPrice: number | null;
  endpointPrice: number | null;
  w: number | null;
  g: number | null;
  r: number | null;
  underlying: { fridayClose: number | null; reopenOpen: number | null; fridayCloseDate: string | null; reopenOpenDate: string | null } | null;
  corporateAction: { status: string; detail: string };
  turnover: { completeHours: number; totalHours: number; medianHourlyUsdt: number | null; eligible: boolean; reason: string | null };
  exclusions: string[];
}

export function loadEvidence() {
  return {
    manifest: read<{ generatedAt: string; pullFinishedAt: string; supportedSymbols: string[]; unsupported: Record<string, string>; redistribution: string; files: Record<string, string> }>("manifest.json"),
    weekends: read<{ weekends: Record<string, WeekendRow[]> }>("weekends.json"),
    evaluations: read<{
      referenceInputs: Record<string, unknown>;
      holdoutSymbol: string;
      headlineMinEvaluations: number;
      crossNameActionsByWeekend: Record<string, unknown[]>;
      evaluations: Record<string, { baseCoin: string; holdout: boolean; intents: Record<string, { evaluatedAfterWarmup: number; extremeEpisodes: number; matchedExtremeWithAtLeast3: number; actions: number; standDowns: number; standDownFrequency: number | null; headlineEligible: boolean; wealthDifferenceUsdt: Record<string, { modeledVsNoTrade: number; modeledVsIntended: number; intendedVsNoTrade: number }> }> }>;
    }>("evaluations.json"),
    validation: read<{ supported: string[]; unsupported: Record<string, string>; instruments: Record<string, { baseCoin: string; underlying: string; weekends: number; boundaryCompleteCanonical: number; turnoverEligibleSessions: number; firstBar: string; lastBar: string; regularOpenEvidence: { weekendsChecked: number; reopenBarTurnoverAtLeast5xPrior: number }; quoteTurnoverUnitCheck: { checked: number; vwapInsideBarRange: number } }> }>("validation-report.json"),
    receipts: read<{ server?: { url?: string; name?: string | null; version?: string | null }; toolsListed?: string[]; receipts?: { entryId: string | null; outcome: string; calledAt: string; usedFor: string; contentSha256: string | null; statusCode: number | null }[]; attempts?: { attemptedAt: string; connected: boolean; error: string | null; allOk: boolean; calls: number }[] }>("tool-receipts.json"),
    ingest: read<{ finishedAt: string }>("ingest-status.json"),
  };
}
