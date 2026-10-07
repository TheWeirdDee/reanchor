/** PRD candidate list. Support is decided by verified discovery and data coverage, never by this list alone. */
export const CANDIDATE_BASE_COINS = ["rNVDA", "rTSLA", "rAAPL", "rMSFT", "rAMZN", "rMETA", "rQQQ"] as const;

export interface VerifiedInstrument {
  /** Exact case-sensitive exchange symbol, e.g. RNVDAUSDT. */
  symbol: string;
  /** Exact base coin as returned, e.g. rNVDA. */
  baseCoin: string;
  quoteCoin: string;
  /** Underlying ticker from Bitget Reality stock-info, e.g. NVDA. */
  underlying: string;
  underlyingAssetClass: "stocks" | "etf";
  pricePrecision: number;
  quantityPrecision: number;
  minOrderQty: number;
  minOrderAmount: number;
  buyLimitPriceRatio: number;
  sellLimitPriceRatio: number;
  launchTimeMs: number | null;
  weekendTradable: boolean;
  tradingPeriod: string[];
  identityEvidence: string[];
  supported: boolean;
  exclusionReason: string | null;
}

export interface InstrumentsFile {
  discoveredAt: string;
  instruments: VerifiedInstrument[];
  marketStates: unknown;
  marketCalendar: { timeZone: string; closures: { startEt: string; endEt: string }[]; regularConfig: string[] };
  receipts: unknown[];
}

/** Display label without the quote coin, e.g. rNVDA. */
export const label = (i: Pick<VerifiedInstrument, "baseCoin">) => i.baseCoin;
