import type { Card } from "@/domain/decision";
import type { Intent } from "@/domain/intent";

export interface MetaInstrument {
  symbol: string;
  baseCoin: string;
  underlying: string;
  pricePrecision: number;
  quantityPrecision: number;
  minOrderAmount: number;
  replays: { key: string; label: string; decisionMs: number; primaryEligible: boolean; note: string | null }[];
}

export interface MetaResponse {
  available: boolean;
  now?: number;
  snapshotPulledAt?: string;
  phase?: "WEEKEND_BOOK" | "BETWEEN_TRANSITION_AND_OPEN" | "WEEKDAY" | "UNKNOWN";
  session?: { key: string; startMs: number; transitionMs: number; reopenMs: number } | null;
  nextSession?: { key: string; startMs: number; transitionMs: number; reopenMs: number } | null;
  instruments?: MetaInstrument[];
  unsupported?: Record<string, string>;
  model: { available: boolean; model: string; reason: string | null };
}

export interface Provenance {
  label: string;
  source: string;
  retrievedAt: string | null;
  status: "OK" | "FAILED" | "SNAPSHOT";
  detail: string;
}

export interface ResearchResult {
  card: Card;
  basis: number | null;
  provenance: Provenance[];
  snapshot: { pulledAt: string; manifestGeneratedAt: string | null };
}

export interface FormState {
  symbol: string;
  intent: Intent;
  holding: string;
  trade: string;
  limit: string;
}

export type FieldSource = Partial<Record<keyof FormState, "text">>;
