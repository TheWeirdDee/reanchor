import "server-only";
import { z } from "zod";
import { ConfirmedIntention, validateIntention } from "../domain/intent";
import { sessionStateAt } from "../domain/calendar";
import type { Card } from "../domain/decision";
import { datasetAvailable, loadDataset } from "./dataset";
import { liveCard, replayCard, replayOptions } from "./research";
import { gatherLive, type LiveProvenance } from "./live";
import { getPresentation } from "./presentation";

export const ResearchRequest = z.object({
  intention: ConfirmedIntention,
  mode: z.enum(["live", "replay"]),
  replayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type ResearchRequest = z.infer<typeof ResearchRequest>;

export interface ResearchResponse {
  card: Card;
  basis: number | null;
  provenance: LiveProvenance[];
  snapshot: { pulledAt: string; manifestGeneratedAt: string | null };
}

export class UserFacingError extends Error {
  constructor(message: string, readonly status = 400, readonly fields: { field: string; message: string }[] = []) {
    super(message);
  }
}

export async function runResearch(req: ResearchRequest, now = Date.now()): Promise<ResearchResponse> {
  if (!datasetAvailable()) throw new UserFacingError("The research dataset is not available on this server", 503);
  const ds = loadDataset();
  const errs = validateIntention(req.intention, ds.supported.map((i) => i.symbol));
  if (errs.length) throw new UserFacingError("Please correct the highlighted fields", 422, errs);
  const snapshot = { pulledAt: String(ds.ingest.finishedAt), manifestGeneratedAt: (ds.manifest?.generatedAt as string | undefined) ?? null };
  const baseProv: LiveProvenance[] = [
    { label: "Historical snapshot", source: "data/bars.json, data/weekends.json (Bitget v3 history-candles)", retrievedAt: snapshot.pulledAt, status: "SNAPSHOT", detail: "Saved weekend windows used for historical cohorts" },
    Object.values(ds.corporate.byUnderlying).every((c) => c.status === "OK")
      ? { label: "Corporate actions and earnings dates", source: "Bitget AI MCP (bitget-mcp-server) via data/tool-receipts.json", retrievedAt: ds.corporate.retrievedAt, status: "SNAPSHOT", detail: "Used to exclude split and ex-dividend weekends" }
      : {
          label: "Corporate actions (fallback)",
          source: "Bitget /api/v3/market/split-records + Nasdaq.com dividend history (data/corporate-fallback.json)",
          retrievedAt: ds.corporateFallback?.retrievedAt ?? null,
          status: "SNAPSHOT",
          detail: `Bitget AI data MCP, last recorded outcome: ${getPresentation().integrations.dataMcp.outcome}. Receipts preserved in data/tool-receipts.json; earnings dates unavailable`,
        },
    { label: "Underlying official open/close", source: ds.anchors.source, retrievedAt: ds.anchors.retrievedAt, status: "SNAPSHOT", detail: "Kept separate from token prices" },
  ];
  if (req.mode === "replay") {
    if (!req.replayKey) throw new UserFacingError("Choose a weekend to replay");
    const { card, basis } = replayCard(ds, req.intention, req.replayKey);
    return { card, basis, provenance: baseProv, snapshot };
  }
  const inst = ds.supported.find((i) => i.symbol === req.intention.symbol)!;
  const { inputs, provenance } = await gatherLive(ds, inst, now);
  const { card, basis } = liveCard(ds, req.intention, inputs);
  return { card, basis, provenance: [...provenance, ...baseProv], snapshot };
}

export function meta(now = Date.now()) {
  if (!datasetAvailable()) return { available: false as const };
  const ds = loadDataset();
  const st = sessionStateAt(now, ds.closures);
  return {
    available: true as const,
    now,
    snapshotPulledAt: String(ds.ingest.finishedAt),
    phase: st.phase,
    session: st.session,
    nextSession: st.nextSession,
    instruments: ds.supported.map((i) => ({
      symbol: i.symbol,
      baseCoin: i.baseCoin,
      underlying: i.underlying,
      pricePrecision: i.pricePrecision,
      quantityPrecision: i.quantityPrecision,
      minOrderAmount: i.minOrderAmount,
      replays: replayOptions(ds, i.symbol),
    })),
    unsupported: (ds.manifest?.unsupported as Record<string, string> | undefined) ?? {},
  };
}
export type Meta = ReturnType<typeof meta>;
