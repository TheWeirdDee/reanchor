import { z } from "zod";

export const INTENTS = ["HOLD", "BUY_DIP", "SELL_POP"] as const;
export type Intent = (typeof INTENTS)[number];

export const DEMO_CAP_USDT = 50_000;

export const INTENT_LABEL: Record<Intent, string> = {
  HOLD: "Hold: check whether to trim",
  BUY_DIP: "Buy the dip",
  SELL_POP: "Sell into a pop",
};

/** The structured intention the user confirms before any calculation runs. */
export const ConfirmedIntention = z.object({
  symbol: z.string().min(1),
  intent: z.enum(INTENTS),
  /** Value of the existing holding in USDT. Required for HOLD and SELL_POP. */
  holdingUsdt: z.number().nullable(),
  /** Proposed trade size in USDT. Required for BUY_DIP and SELL_POP. */
  tradeUsdt: z.number().nullable(),
  /** Proposed absolute limit in USDT per token. Required for BUY_DIP and SELL_POP. */
  limitPrice: z.number().nullable(),
});
export type ConfirmedIntention = z.infer<typeof ConfirmedIntention>;

export interface FieldError {
  field: keyof ConfirmedIntention;
  message: string;
}

const positiveFinite = (v: number | null) => v !== null && Number.isFinite(v) && v > 0;

/** Input validation applied before research. Missing limits are reported, not invented. */
export function validateIntention(x: ConfirmedIntention, supportedSymbols: string[]): FieldError[] {
  const errs: FieldError[] = [];
  if (!supportedSymbols.includes(x.symbol)) errs.push({ field: "symbol", message: "Choose a supported instrument" });
  const needHolding = x.intent === "HOLD" || x.intent === "SELL_POP";
  const needTrade = x.intent === "BUY_DIP" || x.intent === "SELL_POP";
  const needLimit = needTrade;
  for (const [field, needed, label] of [
    ["holdingUsdt", needHolding, "Holding value"],
    ["tradeUsdt", needTrade, "Trade size"],
  ] as const) {
    const v = x[field];
    if (needed && v === null) errs.push({ field, message: `${label} is required for this intent` });
    else if (v !== null && !positiveFinite(v)) errs.push({ field, message: `${label} must be a positive number` });
    else if (v !== null && v > DEMO_CAP_USDT) errs.push({ field, message: `${label} is capped at ${DEMO_CAP_USDT.toLocaleString("en-US")} USDT in this demo` });
  }
  if (needLimit && x.limitPrice === null) errs.push({ field: "limitPrice", message: "Enter a proposed limit price in USDT per token" });
  else if (x.limitPrice !== null && !positiveFinite(x.limitPrice)) errs.push({ field: "limitPrice", message: "Limit price must be a positive number" });
  if (x.intent === "SELL_POP" && positiveFinite(x.tradeUsdt) && positiveFinite(x.holdingUsdt) && (x.tradeUsdt as number) > (x.holdingUsdt as number)) {
    errs.push({ field: "tradeUsdt", message: "You cannot sell more than you hold; no short selling is modeled" });
  }
  return errs;
}
