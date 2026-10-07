import { describe, expect, it } from "vitest";
import { BarIndex, normalizeCandles, RawCandleResponse } from "../../src/domain/candles";
import { canonicalElapsed, observe } from "../../src/domain/episodes";
import { computeHt, sessionHourlyTurnover, TURNOVER_VALID_FROM_MS } from "../../src/domain/turnover";
import { BAR_MS } from "../../src/domain/time";
import { buildFixture } from "../fixtures/synthetic";

const T0 = Date.UTC(2026, 8, 25, 23, 45);
const row = (ts: number, o: string, h: string, l: string, c: string, v: string | null = "1", q: string | null = "100") => [String(ts), o, h, l, c, v, q] as never;

describe("candle normalization", () => {
  it("validates the raw Bitget response shape", () => {
    const ok = RawCandleResponse.safeParse({ code: "00000", msg: "success", requestTime: 1, data: [["1790942400000", "1", "2", "0.5", "1.5", "10", "15"]] });
    expect(ok.success).toBe(true);
    const bad = RawCandleResponse.safeParse({ code: "00000", msg: "success", requestTime: 1, data: [["x", "1", "2", "0.5", "1.5"]] });
    expect(bad.success).toBe(false);
  });

  it("excludes unclosed bars, invalid OHLC, off-grid timestamps and conflicting duplicates", () => {
    const asOf = T0 + 3 * BAR_MS + 1;
    const r = normalizeCandles(
      [
        row(T0, "100", "101", "99", "100.5"),
        row(T0, "100", "101", "99", "100.5"), // identical duplicate
        row(T0 + BAR_MS, "100", "101", "99", "100"),
        row(T0 + BAR_MS, "100", "102", "99", "101"), // conflicting duplicate
        row(T0 + 2 * BAR_MS, "100", "99", "101", "100"), // high < low
        row(T0 + 2 * BAR_MS + 5, "100", "101", "99", "100"), // off grid
        row(T0 + 3 * BAR_MS, "100", "101", "99", "100"), // unclosed at asOf
      ],
      asOf,
    );
    expect(r.bars.map((b) => b.ts)).toEqual([T0]);
    expect(r.duplicatesIdentical).toBe(1);
    const codes = r.issues.map((i) => i.code).sort();
    expect(codes).toEqual(["CONFLICTING_DUPLICATE", "INVALID_OHLC", "OFF_GRID", "UNCLOSED"]);
  });

  it("keeps missing turnover distinct from zero turnover", () => {
    const r = normalizeCandles([row(T0, "1", "1", "1", "1", "", ""), row(T0 + BAR_MS, "1", "1", "1", "1", "0", "0")], T0 + 10 * BAR_MS);
    expect(r.bars[0].quoteTurnover).toBeNull();
    expect(r.bars[1].quoteTurnover).toBe(0);
  });

  it("looks up bars by interval start and by interval end", () => {
    const idx = new BarIndex(normalizeCandles([row(T0, "1", "1", "1", "1")], T0 + 2 * BAR_MS).bars);
    expect(idx.starting(T0)).toBeDefined();
    expect(idx.endingAt(T0 + BAR_MS)).toBeDefined();
    expect(idx.endingAt(T0)).toBeUndefined();
    expect(idx.missingIn(T0, T0 + 4 * BAR_MS)).toBe(3);
  });
});

describe("episode boundaries", () => {
  const fx = buildFixture("2026-09-26", [{ w: 0.02, r: -0.03, g: -0.01 }]);
  const ep = fx.episodes[0];

  it("uses the bar ending at Friday 20:00 ET, the bar starting 09:30 and the bar ending 10:30", () => {
    expect(ep.fridayRef).toBe(100);
    expect(ep.reopenPrice).toBeCloseTo(102 * 0.99, 10);
    expect(ep.endpointPrice).toBeCloseTo(102 * 0.97, 10);
    expect(ep.baseExclusions).toEqual([]);
  });

  it("includes the reopening gap in the total return", () => {
    const ob = observe(ep, fx.index, canonicalElapsed(ep));
    expect(ob.decisionPrice).toBeCloseTo(102, 10);
    expect(ob.w).toBeCloseTo(0.02, 10);
    expect(ob.g).toBeCloseTo(-0.01, 10);
    expect(ob.r).toBeCloseTo(-0.03, 10);
    // r is measured from the decision price, not from the reopening price
    expect(ob.r).not.toBeCloseTo((ep.endpointPrice as number) / (ep.reopenPrice as number) - 1, 6);
  });

  it("does not take the close of a bar starting at Friday 20:00 as the Friday reference", () => {
    const fx2 = buildFixture("2026-09-26", [{ w: 0.02, r: 0.01, omit: ["friday"] }]);
    expect(fx2.episodes[0].fridayRef).toBeNull();
    expect(fx2.episodes[0].baseExclusions.join(" ")).toContain("Friday reference");
  });

  it("excludes missing reopen and endpoint bars without a one-hour approximation", () => {
    const fx3 = buildFixture("2026-09-26", [{ w: 0.02, r: 0.01, omit: ["reopen", "endpoint"] }]);
    const ex = fx3.episodes[0].baseExclusions.join(" ");
    expect(ex).toContain("starting at the regular reopening");
    expect(ex).toContain("ending 60 minutes after");
  });

  it("offers a display-only fallback when the exact decision bar is missing", () => {
    const fx4 = buildFixture("2026-09-26", [{ w: 0.02, r: 0.01, omit: ["decision"] }]);
    const ob = observe(fx4.episodes[0], fx4.index, canonicalElapsed(fx4.episodes[0]));
    expect(ob.decisionPrice).toBeNull();
    expect(ob.w).toBeNull();
    expect(ob.fallbackPrice).toBe(100);
    expect(ob.exclusions[0]).toContain("Missing 15m bar ending exactly");
  });
});

describe("H_t turnover denominator", () => {
  it("sums four complete 15m bars per hour and takes the median", () => {
    const fx = buildFixture("2026-09-12", [{ w: 0, r: 0, turnoverPerBar: 250 }]);
    const t = sessionHourlyTurnover(fx.sessions[0], fx.index);
    expect(t.totalHours).toBe(48);
    expect(t.completeHours).toBe(48);
    expect(t.medianHourlyUsdt).toBe(1000);
  });

  it("does not count missing bars as zero", () => {
    const fx = buildFixture("2026-09-12", [{ w: 0, r: 0 }]);
    const s = fx.sessions[0];
    const kept = fx.bars.filter((b) => !(b.ts >= s.startMs && b.ts < s.startMs + 45 * 3_600_000 && (b.ts / BAR_MS) % 4 === 1));
    const t = sessionHourlyTurnover(s, new BarIndex(kept));
    expect(t.completeHours).toBe(3);
    expect(t.eligible).toBe(false);
    expect(t.medianHourlyUsdt).toBeNull();
  });

  it("requires the latest three completed sessions and ignores later data", () => {
    const fx = buildFixture("2026-08-08", [
      { w: 0, r: 0, turnoverPerBar: 100 },
      { w: 0, r: 0, turnoverPerBar: 200 },
      { w: 0, r: 0, turnoverPerBar: 300 },
      { w: 0, r: 0, turnoverPerBar: 400 },
      { w: 0, r: 0, turnoverPerBar: 9999 },
    ]);
    const t = fx.sessions[4].transitionMs - 1; // during the fifth weekend
    const ht = computeHt(t, fx.sessions, fx.index);
    expect(ht.sessions.map((s) => s.key)).toEqual(["2026-08-29", "2026-08-22", "2026-08-15"]);
    expect(ht.value).toBe(1200); // median of 1600, 1200, 800
    // At a canonical decision the evaluated weekend's own session (ending exactly at t) is excluded.
    const atCanonical = computeHt(fx.sessions[3].transitionMs, fx.sessions, fx.index);
    expect(atCanonical.sessions.map((s) => s.key)).toEqual(["2026-08-22", "2026-08-15", "2026-08-08"]);
    const early = computeHt(fx.sessions[1].transitionMs, fx.sessions, fx.index);
    expect(early.value).toBeNull();
  });

  it("never uses turnover before the 2026-07-09 validity date", () => {
    const fx = buildFixture("2026-06-27", [{ w: 0, r: 0 }]);
    expect(fx.sessions[0].startMs).toBeLessThan(TURNOVER_VALID_FROM_MS);
    expect(sessionHourlyTurnover(fx.sessions[0], fx.index).eligible).toBe(false);
  });
});
