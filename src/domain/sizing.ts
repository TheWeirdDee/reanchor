import type { Intent } from "./intent";
import { floorToDecimals } from "./stats";

export const HOLD_TRIM_FRACTION = 0.25;
export const HARD_PARTICIPATION_LIMIT = 0.25;
export const MODELED_CAP = 0.1;

export interface PrecisionSpec {
  quantityDecimals: number | null;
  minOrderQty: number | null;
  minOrderAmount: number | null;
}

export interface Sizing {
  /** HOLD: 25% of holding. BUY_DIP/SELL_POP: the entered trade value. */
  proposedClipUsdt: number | null;
  /** Proposed clip / H_t. */
  proposedParticipation: number | null;
  capAtTenPctUsdt: number | null;
  holdingsCapUsdt: number | null;
  /** min(proposed, 10% H_t, holdings if selling), before precision. */
  capacityUsdt: number | null;
  /** Floored order quantity at the pricing reference. */
  quantity: number | null;
  /** Actionable modeled clip in USDT after precision; null when not actionable. */
  modeledClipUsdt: number | null;
  modeledParticipation: number | null;
  pricingReference: number | null;
  provisional: boolean;
  reductionReasons: string[];
  failures: string[];
}

export function proposedClip(intent: Intent, holdingUsdt: number | null, tradeUsdt: number | null): number | null {
  if (intent === "HOLD") return holdingUsdt === null ? null : holdingUsdt * HOLD_TRIM_FRACTION;
  return tradeUsdt;
}

/**
 * Modeled clip = min(proposed clip, 0.10 * H_t, available holding value when selling),
 * then floored to verified quantity precision and checked against minimum quantity and notional.
 */
export function sizeClip(args: {
  intent: Intent;
  holdingUsdt: number | null;
  tradeUsdt: number | null;
  ht: number | null;
  pricingReference: number | null;
  precision: PrecisionSpec;
}): Sizing {
  const { intent, holdingUsdt, tradeUsdt, ht, pricingReference, precision } = args;
  const proposed = proposedClip(intent, holdingUsdt, tradeUsdt);
  const reductionReasons: string[] = [];
  const failures: string[] = [];
  const out: Sizing = {
    proposedClipUsdt: proposed,
    proposedParticipation: proposed !== null && ht ? proposed / ht : null,
    capAtTenPctUsdt: ht ? MODELED_CAP * ht : null,
    holdingsCapUsdt: intent === "BUY_DIP" ? null : holdingUsdt,
    capacityUsdt: null,
    quantity: null,
    modeledClipUsdt: null,
    modeledParticipation: null,
    pricingReference,
    provisional: false,
    reductionReasons,
    failures,
  };
  if (proposed === null) {
    failures.push("Proposed clip unavailable");
    return out;
  }
  if (!ht || ht <= 0) {
    failures.push("Hourly turnover denominator H_t unavailable");
    return out;
  }
  let cap = Math.min(proposed, MODELED_CAP * ht);
  if (cap < proposed) reductionReasons.push(`Reduced to 10% of H_t (${(MODELED_CAP * 100).toFixed(0)}% participation cap)`);
  if (intent !== "BUY_DIP" && holdingUsdt !== null && holdingUsdt < cap) {
    cap = holdingUsdt;
    reductionReasons.push("Reduced to the stated holding value");
  }
  out.capacityUsdt = cap;
  if (precision.quantityDecimals === null || precision.minOrderQty === null || precision.minOrderAmount === null || pricingReference === null) {
    out.provisional = true;
    failures.push("Instrument precision or pricing reference unknown; capacity shown as provisional, no actionable clip");
    return out;
  }
  const qty = floorToDecimals(cap / pricingReference, precision.quantityDecimals);
  const notional = qty * pricingReference;
  out.quantity = qty;
  if (qty <= 0 || qty < precision.minOrderQty) {
    failures.push(`Quantity ${qty} is below the minimum order quantity ${precision.minOrderQty}`);
    return out;
  }
  if (notional < precision.minOrderAmount) {
    failures.push(`Notional ${notional.toFixed(2)} USDT is below the minimum order amount ${precision.minOrderAmount} USDT`);
    return out;
  }
  if (notional < cap - 1e-9) reductionReasons.push(`Quantity floored to ${precision.quantityDecimals} decimals`);
  out.modeledClipUsdt = notional;
  out.modeledParticipation = notional / ht;
  return out;
}

export interface BandCheck {
  status: "INSIDE_APPROX" | "OUTSIDE" | "NOT_APPLICABLE" | "UNKNOWN";
  sessionReference: number | null;
  weekendLower: number | null;
  weekendUpper: number | null;
  instrumentRatio: number | null;
  instrumentReference: number | null;
  instrumentLower: number | null;
  instrumentUpper: number | null;
  note: string;
}

/** Bitget support: "approximately ±20% (relative to the closing price before the switch)" for weekend limit orders. Reference used: the Friday token reference. */
export const WEEKEND_BAND = 0.2;

/**
 * Approximate order-placement band. The limit must sit inside both the documented weekend band around
 * the token session reference and the instrument's published limit-price ratio around the latest token price.
 * Inside the band does not guarantee acceptance or a fill.
 */
export function checkBand(args: {
  intent: Intent;
  limitPrice: number | null;
  sessionReference: number | null;
  latestTokenPrice: number | null;
  buyRatio: number | null;
  sellRatio: number | null;
}): BandCheck {
  const { intent, limitPrice, sessionReference, latestTokenPrice } = args;
  const ratio = intent === "BUY_DIP" ? args.buyRatio : intent === "SELL_POP" ? args.sellRatio : null;
  const base: BandCheck = {
    status: "UNKNOWN",
    sessionReference,
    weekendLower: sessionReference !== null ? sessionReference * (1 - WEEKEND_BAND) : null,
    weekendUpper: sessionReference !== null ? sessionReference * (1 + WEEKEND_BAND) : null,
    instrumentRatio: ratio,
    instrumentReference: latestTokenPrice,
    instrumentLower: ratio !== null && latestTokenPrice !== null ? latestTokenPrice * (1 - ratio) : null,
    instrumentUpper: ratio !== null && latestTokenPrice !== null ? latestTokenPrice * (1 + ratio) : null,
    note: "",
  };
  if (intent === "HOLD") return { ...base, status: "NOT_APPLICABLE", note: "Trim is modeled at the observed decision price; no limit is checked" };
  if (limitPrice === null) return { ...base, note: "No limit entered" };
  if (base.weekendLower === null || base.instrumentLower === null || base.weekendUpper === null || base.instrumentUpper === null) {
    return { ...base, note: "Band reference unavailable" };
  }
  const inside =
    limitPrice >= base.weekendLower && limitPrice <= base.weekendUpper &&
    limitPrice >= base.instrumentLower && limitPrice <= base.instrumentUpper;
  return {
    ...base,
    status: inside ? "INSIDE_APPROX" : "OUTSIDE",
    note: inside
      ? "Inside the approximate band; this does not guarantee exchange acceptance or a fill"
      : "Outside the approximate placement band; the exchange may reject this limit",
  };
}
