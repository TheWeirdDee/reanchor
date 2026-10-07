import type { Intent } from "./intent";
import { floorToDecimals } from "./stats";

/** Default fee per modeled fill (0.10%). An assumption, replaceable by verified rToken fees. */
export const DEFAULT_FEE_RATE = 0.001;

/**
 * Slippage per fill by participation of H_t: 5 bps at <= 5%, 15 bps above 5% through 10%, no modeled fill above 10%.
 * Sensitivity assumptions, not validated execution estimates.
 */
export const SLIPPAGE_TIERS = [
  { maxParticipation: 0.05, bps: 5 },
  { maxParticipation: 0.1, bps: 15 },
] as const;

export function slippageBpsFor(participation: number): number | null {
  if (!Number.isFinite(participation) || participation < 0) return null;
  for (const t of SLIPPAGE_TIERS) if (participation <= t.maxParticipation) return t.bps;
  return null;
}

export type CostCase = "ZERO" | "DEFAULT" | "DOUBLE_SLIPPAGE";
export const COST_CASES: CostCase[] = ["ZERO", "DEFAULT", "DOUBLE_SLIPPAGE"];

export function costParams(c: CostCase, slipBps: number) {
  if (c === "ZERO") return { fee: 0, slip: 0 };
  if (c === "DEFAULT") return { fee: DEFAULT_FEE_RATE, slip: slipBps / 10_000 };
  return { fee: DEFAULT_FEE_RATE, slip: (2 * slipBps) / 10_000 };
}

export interface Variant {
  label: string;
  /** Tokens bought or sold in this variant (floored to precision). */
  quantity: number;
  /** USDT spent (buy) or received gross (sale). */
  cashFlow: number;
  costs: number;
  /** Endpoint wealth on the common initial budget or holding. */
  endpointWealth: number;
  executable: boolean;
  note: string | null;
}

export interface Comparison {
  kind: "BUY_BUDGET" | "HOLDING";
  costCase: CostCase;
  initial: number;
  modeled: Variant;
  intended: Variant;
  noTrade: Variant;
  /** modeled minus intended, null when the intended benchmark is non-executable. */
  modeledVsIntended: number | null;
  modeledVsNoTrade: number;
}

export interface ComparisonInput {
  intent: Intent;
  decisionPrice: number;
  endpointPrice: number;
  /** BUY_DIP: intended trade USDT. HOLD/SELL_POP: holding USDT. */
  initial: number;
  intendedUsdt: number;
  modeledUsdt: number;
  quantityDecimals: number;
  slipBps: number;
  intendedExecutable: boolean;
  costCase: CostCase;
}

/**
 * Quote-based hypothetical comparison at the observed decision quote and endpoint.
 * Buy accounting (BUY_DIP) and holding accounting (HOLD, SELL_POP) are kept separate.
 * Costs are charged only for transactions that occur in each variant. No short positions exist.
 */
export function compare(x: ComparisonInput): Comparison {
  const { fee, slip } = costParams(x.costCase, x.slipBps);
  if (x.intent === "BUY_DIP") {
    const buy = (usdt: number, label: string, executable: boolean, note: string | null): Variant => {
      const entry = x.decisionPrice * (1 + slip);
      const qty = floorToDecimals(usdt / entry, x.quantityDecimals);
      const spent = qty * entry;
      const buyFee = spent * fee;
      // Endpoint liquidation of the bought tokens to mark wealth in USDT.
      const exitGross = qty * x.endpointPrice * (1 - slip);
      const exitFee = exitGross * fee;
      const wealth = x.initial - spent - buyFee + exitGross - exitFee;
      return { label, quantity: qty, cashFlow: spent, costs: buyFee + exitFee + qty * x.decisionPrice * slip + qty * x.endpointPrice * slip, endpointWealth: wealth, executable, note };
    };
    const modeled = buy(x.modeledUsdt, "Modeled clip", true, null);
    const intended = buy(x.intendedUsdt, "Full intended buy", x.intendedExecutable, x.intendedExecutable ? null : "Non-executable under the fill model (participation above 10% of H_t); quote benchmark only");
    const noTrade: Variant = { label: "No new purchase", quantity: 0, cashFlow: 0, costs: 0, endpointWealth: x.initial, executable: true, note: null };
    return {
      kind: "BUY_BUDGET",
      costCase: x.costCase,
      initial: x.initial,
      modeled,
      intended,
      noTrade,
      modeledVsIntended: x.intendedExecutable ? modeled.endpointWealth - intended.endpointWealth : null,
      modeledVsNoTrade: modeled.endpointWealth - noTrade.endpointWealth,
    };
  }
  const holdingQty = x.initial / x.decisionPrice;
  const sell = (usdt: number, label: string, executable: boolean, note: string | null): Variant => {
    const qty = Math.min(floorToDecimals(usdt / x.decisionPrice, x.quantityDecimals), holdingQty);
    const gross = qty * x.decisionPrice * (1 - slip);
    const saleFee = gross * fee;
    const wealth = gross - saleFee + (holdingQty - qty) * x.endpointPrice;
    return { label, quantity: qty, cashFlow: gross, costs: saleFee + qty * x.decisionPrice * slip, endpointWealth: wealth, executable, note };
  };
  const modeled = sell(x.modeledUsdt, x.intent === "HOLD" ? "Modeled trim" : "Modeled clip sale", true, null);
  const intended = sell(
    x.intendedUsdt,
    x.intent === "HOLD" ? "Full 25% trim" : "Full intended sale",
    x.intendedExecutable,
    x.intendedExecutable ? null : "Non-executable under the fill model (participation above 10% of H_t); quote benchmark only",
  );
  const keep: Variant = { label: "Keep the holding", quantity: 0, cashFlow: 0, costs: 0, endpointWealth: holdingQty * x.endpointPrice, executable: true, note: null };
  return {
    kind: "HOLDING",
    costCase: x.costCase,
    initial: x.initial,
    modeled,
    intended,
    noTrade: keep,
    modeledVsIntended: x.intendedExecutable ? modeled.endpointWealth - intended.endpointWealth : null,
    modeledVsNoTrade: modeled.endpointWealth - keep.endpointWealth,
  };
}
