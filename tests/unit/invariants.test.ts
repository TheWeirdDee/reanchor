import { describe, expect, it } from "vitest";
import { computeCard, type ResearchContext } from "../../src/domain/decision";
import type { ConfirmedIntention } from "../../src/domain/intent";
import { buildFixture, synthInstrument, SYNTH_SYMBOL, type WeekendSpec } from "../fixtures/synthetic";

// Decision-integrity invariants: missing data stays missing, the minimum matched sample is enforced,
// and weekends after the decision time cannot change the card.

const PRIOR: WeekendSpec[] = [
  { w: 0.001, r: 0.002 },
  { w: 0.002, r: 0.0 },
  { w: -0.002, r: 0.001 },
  { w: 0.03, r: -0.02 },
  { w: 0.004, r: 0.0 },
  { w: 0.025, r: -0.015 },
  { w: -0.003, r: 0.002 },
  { w: 0.028, r: -0.01 },
];

function ctxAt(specs: WeekendSpec[], decisionIndex: number, intention: Partial<ConfirmedIntention> = {}): ResearchContext {
  const fx = buildFixture("2026-09-12", specs.map((s) => ({ turnoverPerBar: 2500, ...s })));
  const session = fx.sessions[decisionIndex];
  return {
    instrument: synthInstrument,
    intention: { symbol: SYNTH_SYMBOL, intent: "HOLD", holdingUsdt: 2000, tradeUsdt: null, limitPrice: null, ...intention },
    mode: "REPLAY",
    t: session.canonicalDecisionMs,
    phase: "WEEKEND_BOOK",
    session,
    sessionVerification: { verified: true, notes: [] },
    index: fx.index,
    allSessions: fx.sessions,
    episodes: fx.episodes,
    corporateAction: { status: "CLEAR", detail: "synthetic" },
    underlying: null,
    dataRetrievedAt: "synthetic",
    context: { earningsNote: null },
  };
}

describe("missing data is never treated as zero", () => {
  it("a prior weekend without its decision bar is excluded with a reason, not counted as a 0% move", () => {
    const specs = PRIOR.map((p, i) => (i === 1 ? { ...p, omit: ["decision" as const] } : p));
    const card = computeCard(ctxAt([...specs, { w: 0.03, r: -0.01 }], specs.length));
    const gap = card.history.find((h) => h.status === "EXCLUDED" && h.reasons.join(" ").match(/15m bar/));
    expect(gap).toBeDefined();
    expect(gap!.w).toBeNull();
    expect(gap!.decisionPrice).toBeNull();
    expect(card.signal.eligibleCount).toBe(PRIOR.length - 1);
  });

  it("a current weekend without its decision bar stands down and reports the move as unknown", () => {
    const card = computeCard(ctxAt([...PRIOR, { w: 0.03, r: -0.01, omit: ["decision"] }], PRIOR.length));
    expect(card.observation.decisionPrice).toBeNull();
    expect(card.observation.w).toBeNull();
    expect(card.action).toBe("STAND_DOWN");
    expect(card.hardFailures.join(" ")).toMatch(/Missing the 15m bar ending exactly at the decision time/);
  });
});

describe("minimum matched sample", () => {
  it("two matched extreme reversals are not enough for a directional action", () => {
    // Same history as the TRIM case, but one of the three large reversing weekends is now small.
    const twoLarge = PRIOR.map((p, i) => (i === 5 ? { w: 0.004, r: 0.0 } : p));
    const card = computeCard(ctxAt([...twoLarge, { w: 0.03, r: -0.01 }], twoLarge.length));
    expect(card.signal.matchedCount).toBe(2);
    expect(card.action).toBe("STAND_DOWN");
    expect(card.side).toBeNull();
    expect(card.standDownReasons.join(" ")).toMatch(/Only 2 matched same-direction extreme episodes \(minimum 3\)/);
  });

  it("the same history with three matched reversals does produce TRIM, so the threshold is what decides", () => {
    const card = computeCard(ctxAt([...PRIOR, { w: 0.03, r: -0.01 }], PRIOR.length));
    expect(card.signal.matchedCount).toBe(3);
    expect(card.action).toBe("TRIM");
  });
});

describe("no information after the decision time", () => {
  it("adding later extreme weekends (with opposite outcomes) leaves the decision card unchanged", () => {
    const current: WeekendSpec = { w: 0.03, r: -0.01 };
    const future: WeekendSpec[] = Array.from({ length: 4 }, () => ({ w: 0.035, r: 0.03 }));
    const without = computeCard(ctxAt([...PRIOR, current], PRIOR.length));
    const withFuture = computeCard(ctxAt([...PRIOR, current, ...future], PRIOR.length));
    expect(withFuture.action).toBe(without.action);
    expect(withFuture.signal).toEqual(without.signal);
    expect(withFuture.ht).toEqual(without.ht);
    expect(withFuture.sizing).toEqual(without.sizing);
    expect(withFuture.history.map((h) => [h.key, h.status])).toEqual(without.history.map((h) => [h.key, h.status]));
  });
});
