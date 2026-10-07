import { describe, expect, it } from "vitest";
import { isTradingDay, sessionStateAt, weekendSessionFor } from "../../src/domain/calendar";
import { etParts, etWallToUtc } from "../../src/domain/time";

const iso = (ms: number) => new Date(ms).toISOString();

describe("session calendar", () => {
  it("builds a standard EDT weekend with exact boundaries", () => {
    const s = weekendSessionFor("2026-09-26", [])!;
    expect(s.standard).toBe(true);
    expect(iso(s.startMs)).toBe("2026-09-26T00:00:00.000Z"); // Fri 20:00 EDT
    expect(iso(s.transitionMs)).toBe("2026-09-28T00:00:00.000Z"); // Sun 20:00 EDT
    expect(iso(s.reopenMs)).toBe("2026-09-28T13:30:00.000Z"); // Mon 09:30 EDT
    expect(iso(s.endpointMs)).toBe("2026-09-28T14:30:00.000Z"); // Mon 10:30 EDT
    expect(s.canonicalDecisionMs).toBe(s.transitionMs);
  });

  it("handles the November 2026 DST end inside a weekend", () => {
    // DST ends Sun 2026-11-01 02:00 EDT.
    const s = weekendSessionFor("2026-10-31", [])!;
    expect(iso(s.startMs)).toBe("2026-10-31T00:00:00.000Z"); // Fri 20:00 EDT
    expect(iso(s.transitionMs)).toBe("2026-11-02T01:00:00.000Z"); // Sun 20:00 EST
    expect(iso(s.reopenMs)).toBe("2026-11-02T14:30:00.000Z"); // Mon 09:30 EST
    expect(s.transitionMs - s.startMs).toBe(49 * 3_600_000);
  });

  it("handles the March 2027 DST start inside a weekend", () => {
    const s = weekendSessionFor("2027-03-13", [])!;
    expect(iso(s.startMs)).toBe("2027-03-13T01:00:00.000Z"); // Fri 20:00 EST
    expect(iso(s.transitionMs)).toBe("2027-03-15T00:00:00.000Z"); // Sun 20:00 EDT
    expect(iso(s.reopenMs)).toBe("2027-03-15T13:30:00.000Z");
    expect(s.transitionMs - s.startMs).toBe(47 * 3_600_000);
  });

  it("does not assume Monday is open on a holiday (Labor Day 2026)", () => {
    const s = weekendSessionFor("2026-09-05", [{ startEt: "2026-09-06 20:00", endEt: "2026-09-07 20:00" }])!;
    expect(s.nextTradingDay).toBe("2026-09-08");
    expect(s.standard).toBe(false);
    expect(s.calendarStatus).toBe("RECONCILED");
    expect(iso(s.transitionMs)).toBe("2026-09-08T00:00:00.000Z"); // Mon 20:00 EDT
    expect(iso(s.reopenMs)).toBe("2026-09-08T13:30:00.000Z");
  });

  it("starts the weekend on Thursday when Friday is a holiday", () => {
    const s = weekendSessionFor("2026-07-04", [{ startEt: "2026-07-02 20:00", endEt: "2026-07-03 20:00" }])!;
    expect(s.lastTradingDay).toBe("2026-07-02");
    expect(s.standard).toBe(false);
    expect(s.calendarStatus).toBe("RECONCILED");
  });

  it("marks a holiday missing from the Bitget calendar as unreconciled", () => {
    const s = weekendSessionFor("2026-05-23", [])!;
    expect(s.calendarStatus).toBe("UNRECONCILED");
    expect(s.calendarNotes.join(" ")).toContain("2026-05-25");
  });

  it("marks an unexpected Bitget closure as unreconciled", () => {
    const s = weekendSessionFor("2026-10-10", [{ startEt: "2026-10-11 20:00", endEt: "2026-10-12 20:00" }])!;
    expect(s.calendarStatus).toBe("UNRECONCILED");
  });

  it("treats the day after Thanksgiving early close as nonstandard", () => {
    const s = weekendSessionFor("2026-11-28", [])!;
    expect(s.standard).toBe(false);
    expect(s.nonstandardReasons.join(" ")).toContain("Early close");
  });

  it("returns null outside the verified calendar years", () => {
    expect(weekendSessionFor("2028-01-08", [])).toBeNull();
  });

  it("classifies trading days", () => {
    expect(isTradingDay("2026-09-07")).toBe(false);
    expect(isTradingDay("2026-09-08")).toBe(true);
    expect(isTradingDay("2026-10-03")).toBe(false);
  });

  it("locates the session phase", () => {
    expect(sessionStateAt(etWallToUtc("2026-10-03", 12), []).phase).toBe("WEEKEND_BOOK");
    expect(sessionStateAt(etWallToUtc("2026-10-04", 21), []).phase).toBe("BETWEEN_TRANSITION_AND_OPEN");
    expect(sessionStateAt(etWallToUtc("2026-10-05", 12), []).phase).toBe("WEEKDAY");
    expect(sessionStateAt(etWallToUtc("2026-10-02", 19, 59), []).phase).toBe("WEEKDAY");
    expect(etParts(etWallToUtc("2026-10-02", 20)).dow).toBe(5);
  });
});
