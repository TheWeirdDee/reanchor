import { describe, expect, it } from "vitest";
import { BarIndex } from "../../src/domain/candles";
import { computeCard, type ResearchContext } from "../../src/domain/decision";
import { evaluateSignal } from "../../src/domain/signal";
import { percentileLinear, median } from "../../src/domain/stats";
import type { ConfirmedIntention } from "../../src/domain/intent";
import { buildFixture, synthInstrument, SYNTH_SYMBOL, type WeekendSpec } from "../fixtures/synthetic";

// Seven prior weekends with mixed moves; three large upward moves that reversed.
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

function ctxFor(current: WeekendSpec, intention: Partial<ConfirmedIntention>, priorSpecs = PRIOR, turnoverPerBar = 2500): ResearchContext {
  const fx = buildFixture("2026-09-12", [...priorSpecs.map((p) => ({ ...p, turnoverPerBar })), { ...current, turnoverPerBar }]);
  const session = fx.sessions.at(-1)!;
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

describe("statistics", () => {
  it("computes the 70th percentile with linear interpolation (type 7)", () => {
    expect(percentileLinear([1, 2, 3, 4, 5, 6], 0.7)).toBeCloseTo(4.5, 10);
    expect(percentileLinear([10], 0.7)).toBe(10);
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});

describe("chronological signal", () => {
  it("uses only episodes completed before the decision and ignores corrupted future data", () => {
    const fx = buildFixture("2026-09-12", [...PRIOR, { w: 0.03, r: -0.02 }, { w: 0.5, r: 0.9 }, { w: -0.4, r: 0.3 }]);
    const t = fx.sessions[PRIOR.length].canonicalDecisionMs;
    const a = evaluateSignal(t, 0.03, "CANONICAL", fx.episodes, fx.index);
    // Corrupt everything after t: future bars and future episodes.
    const corrupted = new BarIndex(fx.bars.map((b) => (b.ts >= t ? { ...b, close: b.close * 7, open: b.open * 3, high: b.high * 9 } : b)));
    const b = evaluateSignal(t, 0.03, "CANONICAL", fx.episodes, corrupted);
    expect(a.eligible.map((e) => e.key)).toEqual(b.eligible.map((e) => e.key));
    expect(a.threshold).toBe(b.threshold);
    expect(a.signal).toBe(b.signal);
    expect(a.eligible.every((e) => e.key < fx.sessions[PRIOR.length].key)).toBe(true);
    expect(a.eligible).toHaveLength(PRIOR.length);
  });

  it("requires six eligible episodes", () => {
    const fx = buildFixture("2026-09-12", [...PRIOR.slice(0, 5), { w: 0.03, r: 0 }]);
    const s = evaluateSignal(fx.sessions[5].canonicalDecisionMs, 0.03, "CANONICAL", fx.episodes, fx.index);
    expect(s.signal).toBe("INSUFFICIENT");
    expect(s.threshold).toBeNull();
  });

  it("observes prior weekends at their own Sunday 20:00 ET across the DST change", () => {
    const priors = PRIOR.slice(0, 7);
    const fx = buildFixture("2026-09-12", [...priors, { w: 0.03, r: 0 }]);
    const cur = fx.sessions[priors.length];
    expect(cur.key).toBe("2026-10-31");
    expect(cur.canonicalDecisionMs - cur.startMs).toBe(49 * 3_600_000);
    expect(evaluateSignal(cur.canonicalDecisionMs, 0.03, "CANONICAL", fx.episodes, fx.index).eligible).toHaveLength(7);
    // Matching by raw elapsed milliseconds would wrongly exclude every 48-hour prior weekend.
    expect(evaluateSignal(cur.canonicalDecisionMs, 0.03, 49 * 3_600_000, fx.episodes, fx.index).eligible).toHaveLength(0);
  });

  it("detects reversal from three matched extreme episodes", () => {
    const fx = buildFixture("2026-09-12", [...PRIOR, { w: 0.03, r: 0 }]);
    const s = evaluateSignal(fx.sessions[PRIOR.length].canonicalDecisionMs, 0.03, "CANONICAL", fx.episodes, fx.index);
    expect(s.extreme).toBe(true);
    expect(s.matchedCount).toBe(3);
    expect(s.signal).toBe("REVERSAL");
  });

  it("reports conflicting samples", () => {
    // Four large upward weekends split two reversals and two continuations; nine small weekends.
    const large: WeekendSpec[] = [
      { w: 0.027, r: -0.012 },
      { w: 0.03, r: 0.02 },
      { w: 0.029, r: 0.015 },
      { w: 0.028, r: -0.01 },
    ];
    const small: WeekendSpec[] = Array.from({ length: 9 }, (_, i) => ({ w: 0.001 * (i + 1) * (i % 2 ? -1 : 1), r: 0 }));
    const specs = [...large, ...small];
    const fx = buildFixture("2026-09-12", [...specs, { w: 0.03, r: 0 }]);
    const s = evaluateSignal(fx.sessions[specs.length].canonicalDecisionMs, 0.03, "CANONICAL", fx.episodes, fx.index);
    expect(s.matchedCount).toBe(4);
    expect(s.agreement).toBe(0.5);
    expect(s.signal).toBe("CONFLICTING");
  });
});

describe("intent mapping and hard failures", () => {
  it("HOLD after an extreme upward reversal returns TRIM, a sale, capped at 10% of H_t", () => {
    const card = computeCard(ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD", holdingUsdt: 2000 }));
    expect(card.hardFailures).toEqual([]);
    expect(card.action).toBe("TRIM");
    expect(card.side).toBe("SELL");
    expect(card.ht.value).toBe(10000);
    expect(card.sizing.proposedClipUsdt).toBe(500);
    expect(card.sizing.modeledClipUsdt).toBeLessThanOrEqual(500);
    expect(card.sizing.proposedParticipation).toBeCloseTo(0.05, 10);
  });

  it("HOLD after a downward move stands down", () => {
    const prior = PRIOR.map((p) => ({ ...p, w: -p.w, r: -p.r }));
    const card = computeCard(ctxFor({ w: -0.03, r: 0.01 }, { intent: "HOLD" }, prior));
    expect(card.action).toBe("STAND_DOWN");
    expect(card.side).toBeNull();
  });

  it("BUY_DIP after an extreme downward reversal returns FADE buy", () => {
    const prior = PRIOR.map((p) => ({ ...p, w: -p.w, r: -p.r }));
    const card = computeCard(ctxFor({ w: -0.03, r: 0.01 }, { intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 500, limitPrice: 97 }, prior));
    expect(card.action).toBe("FADE");
    expect(card.side).toBe("BUY");
  });

  it("BUY_DIP after an upward move stands down (incompatible direction)", () => {
    const card = computeCard(ctxFor({ w: 0.03, r: -0.01 }, { intent: "BUY_DIP", holdingUsdt: null, tradeUsdt: 500, limitPrice: 103 }));
    expect(card.action).toBe("STAND_DOWN");
  });

  it("SELL_POP after an extreme upward reversal returns FADE sale of holdings", () => {
    const card = computeCard(ctxFor({ w: 0.03, r: -0.01 }, { intent: "SELL_POP", holdingUsdt: 2000, tradeUsdt: 500, limitPrice: 103 }));
    expect(card.action).toBe("FADE");
    expect(card.side).toBe("SELL");
  });

  it("SELL_POP cannot sell more than held (no shorting)", () => {
    const card = computeCard(ctxFor({ w: 0.03, r: -0.01 }, { intent: "SELL_POP", holdingUsdt: 300, tradeUsdt: 500, limitPrice: 103 }));
    expect(card.action).toBe("STAND_DOWN");
    expect(card.hardFailures.join(" ")).toContain("Insufficient stated holdings");
  });

  it("continuation leads to STAND DOWN for every intent", () => {
    const prior = PRIOR.map((p) => (p.w > 0.02 ? { ...p, r: Math.abs(p.r) } : p));
    for (const intent of ["HOLD", "SELL_POP"] as const) {
      const card = computeCard(ctxFor({ w: 0.03, r: 0 }, { intent, holdingUsdt: 2000, tradeUsdt: intent === "HOLD" ? null : 500, limitPrice: intent === "HOLD" ? null : 103 }, prior));
      expect(card.signal.signal).toBe("CONTINUATION");
      expect(card.action).toBe("STAND_DOWN");
    }
  });

  it("missing limit, out-of-band limit and oversize clips are hard failures", () => {
    const base = { w: 0.03, r: -0.01 };
    expect(computeCard(ctxFor(base, { intent: "SELL_POP", holdingUsdt: 2000, tradeUsdt: 500, limitPrice: null })).hardFailures.join(" ")).toContain("limit price is required");
    expect(computeCard(ctxFor(base, { intent: "SELL_POP", holdingUsdt: 2000, tradeUsdt: 500, limitPrice: 150 })).hardFailures.join(" ")).toContain("outside the approximate placement band");
    const big = computeCard(ctxFor(base, { intent: "SELL_POP", holdingUsdt: 9000, tradeUsdt: 3000, limitPrice: 103 }));
    expect(big.hardFailures.join(" ")).toContain("hard limit 25%");
    expect(big.action).toBe("STAND_DOWN");
  });

  it("unknown corporate-action status or an unverified switch disables the action", () => {
    const c1 = ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD" });
    expect(computeCard({ ...c1, corporateAction: { status: "UNKNOWN", detail: "x" } }).action).toBe("STAND_DOWN");
    expect(computeCard({ ...c1, sessionVerification: { verified: false, notes: ["x"] } }).action).toBe("STAND_DOWN");
    expect(computeCard({ ...c1, phase: "WEEKDAY" }).hardFailures[0]).toContain("Not inside a verified weekend session");
  });

  it("nonstandard (holiday) current weekends stand down even when the closure calendar reconciles", () => {
    const c = ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD" });
    const card = computeCard({ ...c, session: { ...c.session!, standard: false, nonstandardReasons: ["Next regular session is a Tuesday"] } });
    expect(card.action).toBe("STAND_DOWN");
    expect(card.hardFailures.join(" ")).toContain("Nonstandard weekend");
  });

  it("stale live decision prices are rejected", () => {
    const c = ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD" });
    const card = computeCard({ ...c, mode: "LIVE", t: c.session!.transitionMs - 1 + 0, index: new BarIndex(c.index.bars.filter((b) => b.ts < c.session!.transitionMs - 4 * 15 * 60_000)) });
    expect(card.hardFailures.join(" ")).toMatch(/minutes old/);
  });

  it("missing turnover gives STAND DOWN with the reason", () => {
    const c = ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD" });
    const noTurnover = new BarIndex(c.index.bars.map((b) => ({ ...b, quoteTurnover: null })));
    const card = computeCard({ ...c, index: noTurnover });
    expect(card.ht.value).toBeNull();
    expect(card.action).toBe("STAND_DOWN");
    expect(card.hardFailures.join(" ")).toContain("H_t unavailable");
  });

  it("removing the model cannot change the card (pure function of inputs)", () => {
    const c = ctxFor({ w: 0.03, r: -0.01 }, { intent: "HOLD" });
    expect(JSON.stringify(computeCard(c))).toBe(JSON.stringify(computeCard(c)));
  });
});
