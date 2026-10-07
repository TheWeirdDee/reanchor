import { addDays, dowOf, etParts, etWallToUtc, type IsoDate } from "./time";

/**
 * NYSE full-day holidays and 13:00 ET early closes.
 * Source: https://www.nyse.com/markets/hours-calendars (read 2026-10-02).
 * Only the years listed here are verified; other dates resolve to UNKNOWN.
 */
export const NYSE_HOLIDAYS: Record<IsoDate, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King, Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth National Independence Day",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King, Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth National Independence Day",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-12-24": "Christmas Day (observed)",
};

export const NYSE_EARLY_CLOSES: Record<IsoDate, string> = {
  "2026-11-27": "Day after Thanksgiving, 13:00 ET close",
  "2026-12-24": "Christmas Eve, 13:00 ET close",
  "2027-11-26": "Day after Thanksgiving, 13:00 ET close",
};

export const CALENDAR_VERIFIED_FROM: IsoDate = "2026-01-01";
export const CALENDAR_VERIFIED_TO: IsoDate = "2027-12-31";

export function calendarCovers(date: IsoDate): boolean {
  return date >= CALENDAR_VERIFIED_FROM && date <= CALENDAR_VERIFIED_TO;
}

export function isTradingDay(date: IsoDate): boolean {
  const dow = dowOf(date);
  return dow !== 0 && dow !== 6 && !(date in NYSE_HOLIDAYS);
}

/** A closure window from Bitget's Reality market calendar, in New York wall time. */
export interface BitgetClosure {
  startEt: string; // "YYYY-MM-DD HH:mm"
  endEt: string;
}

export type CalendarStatus = "RECONCILED" | "UNRECONCILED" | "UNKNOWN";

export interface WeekendSession {
  /** Key: ISO date of the Saturday inside this weekend. */
  key: IsoDate;
  lastTradingDay: IsoDate;
  nextTradingDay: IsoDate;
  /**
   * Weekend matching start: 20:00 ET on the last trading day. Documented by Bitget support
   * ("Opens every Saturday at 08:00 (UTC+8)" in DST, 09:00 in standard time), which is Friday 20:00 ET.
   */
  startMs: number;
  /**
   * Observed weekend-to-overnight transition: 20:00 ET on the evening before the next trading day.
   * INFERRED, not documented as a cancellation time: Bitget states lists an overnight session 20:00-04:00 ET,
   * Bitget calendar closure windows end at 20:00 ET, and candles change regime at this bar.
   * It ends the window in which Reanchor treats quotes as weekend-only. It is NOT the regular cash open.
   */
  transitionMs: number;
  /** Regular US cash-market reopening, 09:30 ET on the next trading day (Bitget states "regular" 09:30-16:00; NYSE calendar). */
  reopenMs: number;
  /** End of the first regular-session hour. */
  endpointMs: number;
  /** Canonical historical decision time: Sunday 20:00 ET. */
  canonicalDecisionMs: number;
  standard: boolean;
  nonstandardReasons: string[];
  calendarStatus: CalendarStatus;
  calendarNotes: string[];
}

function parseEtWall(s: string): number {
  const [d, hm] = s.trim().split(" ");
  const [h, m] = hm.split(":").map(Number);
  return etWallToUtc(d, h, m);
}

/**
 * Build the weekend session containing the given Saturday.
 * Returns null when the NYSE calendar for the involved dates is not verified.
 */
export function weekendSessionFor(saturday: IsoDate, bitgetClosures: BitgetClosure[] | null): WeekendSession | null {
  if (dowOf(saturday) !== 6) throw new Error(`weekendSessionFor expects a Saturday, got ${saturday}`);
  let last = addDays(saturday, -1);
  while (!isTradingDay(last)) last = addDays(last, -1);
  let next = addDays(saturday, 1);
  while (!isTradingDay(next)) next = addDays(next, 1);
  if (!calendarCovers(last) || !calendarCovers(next)) return null;

  const reasons: string[] = [];
  if (dowOf(last) !== 5) reasons.push(`Last trading day before the weekend is ${last} (holiday ${NYSE_HOLIDAYS[addDays(saturday, -1)] ?? "closure"}), not Friday`);
  if (dowOf(next) !== 1) reasons.push(`Next regular session is ${next}; Monday ${addDays(saturday, 2)} is ${NYSE_HOLIDAYS[addDays(saturday, 2)] ?? "closed"}`);
  if (last in NYSE_EARLY_CLOSES) reasons.push(`Early close on ${last}: ${NYSE_EARLY_CLOSES[last]}`);

  const startMs = etWallToUtc(last, 20, 0);
  const transitionMs = etWallToUtc(addDays(next, -1), 20, 0);
  const reopenMs = etWallToUtc(next, 9, 30);
  const endpointMs = etWallToUtc(next, 10, 30);
  const canonicalDecisionMs = etWallToUtc(addDays(saturday, 1), 20, 0);

  // Reconcile with Bitget's published closure windows.
  const notes: string[] = [];
  let calendarStatus: CalendarStatus;
  if (bitgetClosures === null) {
    calendarStatus = "UNKNOWN";
    notes.push("Bitget market calendar unavailable");
  } else {
    const inWindow = bitgetClosures.filter((c) => {
      const s = parseEtWall(c.startEt);
      return s >= startMs - 3 * 24 * 3_600_000 && s <= transitionMs;
    });
    const expectedHolidays = [] as IsoDate[];
    for (let d = addDays(last, 1); d < next; d = addDays(d, 1)) {
      if (d in NYSE_HOLIDAYS) expectedHolidays.push(d);
    }
    const unmatchedExpected = expectedHolidays.filter(
      (h) => !inWindow.some((c) => c.endEt.startsWith(h) && parseEtWall(c.endEt) === etWallToUtc(h, 20, 0)),
    );
    const unexpected = inWindow.filter((c) => !expectedHolidays.some((h) => c.endEt.startsWith(h)));
    if (unmatchedExpected.length === 0 && unexpected.length === 0) {
      calendarStatus = "RECONCILED";
      notes.push(
        expectedHolidays.length
          ? `Bitget calendar lists closure(s) ending ${expectedHolidays.join(", ")} 20:00 ET`
          : "No Bitget special closure in this window; regular SATURDAY/SUNDAY closure applies",
      );
    } else {
      calendarStatus = "UNRECONCILED";
      if (unmatchedExpected.length) notes.push(`NYSE holiday ${unmatchedExpected.join(", ")} not listed in Bitget calendar`);
      if (unexpected.length) notes.push(`Bitget lists closure(s) not on the NYSE calendar: ${unexpected.map((c) => `${c.startEt} to ${c.endEt}`).join("; ")}`);
    }
  }

  return {
    key: saturday,
    lastTradingDay: last,
    nextTradingDay: next,
    startMs,
    transitionMs,
    reopenMs,
    endpointMs,
    canonicalDecisionMs,
    standard: reasons.length === 0,
    nonstandardReasons: reasons,
    calendarStatus,
    calendarNotes: notes,
  };
}

/** Saturday key of the weekend whose window (last trading day 20:00 ET through the next regular open) contains or follows ms. */
export function saturdayOnOrAfterWeekStart(ms: number): IsoDate {
  const p = etParts(ms);
  // Days until Saturday from current ET date
  const delta = (6 - p.dow + 7) % 7;
  return addDays(p.date, delta);
}

export type SessionPhase = "WEEKEND_BOOK" | "BETWEEN_TRANSITION_AND_OPEN" | "WEEKDAY" | "UNKNOWN";

export interface SessionState {
  phase: SessionPhase;
  session: WeekendSession | null;
  /** Upcoming or current weekend session. */
  nextSession: WeekendSession | null;
}

/**
 * Locate the session state at an instant. WEEKEND_BOOK runs from the weekend start to the observed transition.
 * Between the transition and the end of the first regular hour, Bitget lists overnight and pre-market sessions;
 * Reanchor makes no weekend decision there.
 */
export function sessionStateAt(ms: number, bitgetClosures: BitgetClosure[] | null): SessionState {
  const p = etParts(ms);
  // Candidate weekends: the Saturday of this week and the previous one.
  const thisSat = addDays(p.date, (6 - p.dow + 7) % 7);
  const prevSat = addDays(thisSat, -7);
  for (const sat of [prevSat, thisSat]) {
    if (!calendarCovers(sat)) return { phase: "UNKNOWN", session: null, nextSession: null };
    const s = weekendSessionFor(sat, bitgetClosures);
    if (!s) return { phase: "UNKNOWN", session: null, nextSession: null };
    if (ms >= s.startMs && ms < s.transitionMs) return { phase: "WEEKEND_BOOK", session: s, nextSession: s };
    if (ms >= s.transitionMs && ms < s.endpointMs) return { phase: "BETWEEN_TRANSITION_AND_OPEN", session: s, nextSession: weekendSessionFor(addDays(sat, 7), bitgetClosures) };
  }
  const upcoming = weekendSessionFor(thisSat, bitgetClosures);
  return { phase: "WEEKDAY", session: null, nextSession: upcoming };
}
