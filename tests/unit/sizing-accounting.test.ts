import { describe, expect, it } from "vitest";
import { compare, slippageBpsFor } from "../../src/domain/accounting";
import { checkBand, sizeClip } from "../../src/domain/sizing";
import { validateIntention } from "../../src/domain/intent";
import { runScenario } from "../../src/domain/scenario";

const precision = { quantityDecimals: 4, minOrderQty: 0.0001, minOrderAmount: 10 };

describe("sizing and precision", () => {
  it("caps at 10% of H_t and floors quantity", () => {
    const s = sizeClip({ intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 800, ht: 4000, pricingReference: 233.33, precision });
    expect(s.proposedParticipation).toBeCloseTo(0.2, 10);
    expect(s.capacityUsdt).toBe(400);
    expect(s.quantity).toBe(1.7143); // floor(400 / 233.33, 4)
    expect(s.modeledClipUsdt).toBeCloseTo(1.7143 * 233.33, 8);
    expect(s.modeledClipUsdt!).toBeLessThanOrEqual(400);
    expect(s.reductionReasons.join(" ")).toContain("10% of H_t");
  });

  it("never sells more than the holding", () => {
    const s = sizeClip({ intent: "SELL_POP", holdingUsdt: 50, tradeUsdt: 100, ht: 100000, pricingReference: 10, precision });
    expect(s.capacityUsdt).toBe(50);
  });

  it("rejects clips below the minimum notional", () => {
    const s = sizeClip({ intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 5, ht: 100000, pricingReference: 200, precision });
    expect(s.modeledClipUsdt).toBeNull();
    expect(s.failures[0]).toContain("minimum order amount");
  });

  it("shows provisional capacity when precision is unknown", () => {
    const s = sizeClip({ intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 100, ht: 10000, pricingReference: 200, precision: { quantityDecimals: null, minOrderQty: null, minOrderAmount: null } });
    expect(s.provisional).toBe(true);
    expect(s.capacityUsdt).toBe(100);
    expect(s.modeledClipUsdt).toBeNull();
  });

  it("checks the approximate band against both references", () => {
    const args = { intent: "BUY_DIP" as const, sessionReference: 100, latestTokenPrice: 95, buyRatio: 0.1, sellRatio: 0.1 };
    expect(checkBand({ ...args, limitPrice: 90 }).status).toBe("INSIDE_APPROX");
    expect(checkBand({ ...args, limitPrice: 84 }).status).toBe("OUTSIDE"); // inside 20% of 100 but outside 10% of 95
    expect(checkBand({ ...args, limitPrice: null }).status).toBe("UNKNOWN");
    expect(checkBand({ ...args, intent: "HOLD", limitPrice: null }).status).toBe("NOT_APPLICABLE");
  });

  it("validates intentions", () => {
    const syms = ["X"];
    expect(validateIntention({ symbol: "X", intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 100, limitPrice: null }, syms).map((e) => e.field)).toContain("limitPrice");
    expect(validateIntention({ symbol: "X", intent: "HOLD", holdingUsdt: 60000, tradeUsdt: null, limitPrice: null }, syms)[0].message).toContain("capped");
    expect(validateIntention({ symbol: "X", intent: "HOLD", holdingUsdt: -1, tradeUsdt: null, limitPrice: null }, syms)[0].message).toContain("positive");
    expect(validateIntention({ symbol: "Y", intent: "HOLD", holdingUsdt: 1, tradeUsdt: null, limitPrice: null }, syms)[0].field).toBe("symbol");
    expect(validateIntention({ symbol: "X", intent: "SELL_POP", holdingUsdt: 100, tradeUsdt: 200, limitPrice: 5 }, syms).map((e) => e.field)).toContain("tradeUsdt");
  });
});

describe("costs and wealth accounting", () => {
  it("slippage tiers follow participation", () => {
    expect(slippageBpsFor(0.05)).toBe(5);
    expect(slippageBpsFor(0.08)).toBe(15);
    expect(slippageBpsFor(0.11)).toBeNull();
  });

  it("buy accounting uses a common budget and charges costs only on trades that occur", () => {
    const c = compare({ intent: "BUY_DIP", decisionPrice: 100, endpointPrice: 110, initial: 1000, intendedUsdt: 1000, modeledUsdt: 0, quantityDecimals: 4, slipBps: 5, intendedExecutable: true, costCase: "DEFAULT" });
    expect(c.noTrade.endpointWealth).toBe(1000);
    expect(c.modeled.endpointWealth).toBe(1000); // zero clip: nothing traded, no costs
    expect(c.modeled.costs).toBe(0);
    expect(c.intended.endpointWealth).toBeGreaterThan(1000);
    const zero = compare({ intent: "BUY_DIP", decisionPrice: 100, endpointPrice: 110, initial: 1000, intendedUsdt: 1000, modeledUsdt: 0, quantityDecimals: 4, slipBps: 5, intendedExecutable: true, costCase: "ZERO" });
    expect(zero.intended.endpointWealth).toBeCloseTo(1100, 8);
    expect(c.intended.endpointWealth).toBeLessThan(zero.intended.endpointWealth);
  });

  it("holding accounting keeps the same initial holding and never creates a short", () => {
    const c = compare({ intent: "SELL_POP", decisionPrice: 100, endpointPrice: 90, initial: 1000, intendedUsdt: 5000, modeledUsdt: 250, quantityDecimals: 4, slipBps: 5, intendedExecutable: false, costCase: "ZERO" });
    expect(c.noTrade.endpointWealth).toBeCloseTo(900, 8);
    expect(c.intended.quantity).toBeCloseTo(10, 8); // capped at the 10 tokens held
    expect(c.intended.endpointWealth).toBeCloseTo(1000, 8);
    expect(c.modeled.endpointWealth).toBeCloseTo(250 + 7.5 * 90, 8);
    expect(c.modeledVsIntended).toBeNull(); // non-executable benchmark excluded
  });

  it("doubled slippage is worse than default", () => {
    const args = { intent: "HOLD" as const, decisionPrice: 100, endpointPrice: 100, initial: 2000, intendedUsdt: 500, modeledUsdt: 500, quantityDecimals: 4, slipBps: 15, intendedExecutable: true };
    expect(compare({ ...args, costCase: "DOUBLE_SLIPPAGE" }).modeled.endpointWealth).toBeLessThan(compare({ ...args, costCase: "DEFAULT" }).modeled.endpointWealth);
  });
});

describe("scenario", () => {
  const base = { intent: "HOLD" as const, underlyingFridayClose: 200, underlyingGap: -0.05, basis: 0.001, decisionPrice: 199, modeledClipUsdt: 0, intendedUsdt: 500, holdingUsdt: 2000 };
  it("computes the implied token endpoint from the stock scenario and basis", () => {
    const r = runScenario(base);
    expect(r.enabled).toBe(true);
    expect(r.underlyingImplied).toBeCloseTo(190, 10);
    expect(r.tokenEndpointImplied).toBeCloseTo(190.19, 10);
    expect(r.holdingChange).toBeCloseTo(2000 * (190.19 / 199 - 1), 8);
  });
  it("is disabled when the anchor is unknown", () => {
    const r = runScenario({ ...base, underlyingFridayClose: null });
    expect(r.enabled).toBe(false);
    expect(r.disabledReason).toContain("UNKNOWN");
  });
  it("rejects gaps outside the chosen range", () => {
    expect(runScenario({ ...base, underlyingGap: 0.25 }).enabled).toBe(false);
  });
});
