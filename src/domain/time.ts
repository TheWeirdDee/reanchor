import { TZDate } from "@date-fns/tz";

export const ET = "America/New_York";
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const BAR_MS = 15 * MIN;

/** Calendar date in New York, formatted YYYY-MM-DD. */
export type IsoDate = string;

/** UTC milliseconds for a wall-clock time in New York on the given date. DST-aware via the IANA database. */
export function etWallToUtc(date: IsoDate, hour: number, minute = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  return new TZDate(y, m - 1, d, hour, minute, ET).getTime();
}

export interface EtParts {
  date: IsoDate;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  dow: number;
}

export function etParts(ms: number): EtParts {
  const t = new TZDate(ms, ET);
  const year = t.getFullYear();
  const month = t.getMonth() + 1;
  const day = t.getDate();
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    hour: t.getHours(),
    minute: t.getMinutes(),
    dow: t.getDay(),
  };
}

/** Day of week (0 = Sunday) for a calendar date, independent of timezone. */
export function dowOf(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Round a timestamp down to the 15-minute grid (UTC grid equals ET grid for whole-hour offsets). */
export function floorToBar(ms: number): number {
  return Math.floor(ms / BAR_MS) * BAR_MS;
}

/** Human-readable New York time, e.g. "Sun 2026-09-27 20:00 ET". */
export function fmtEt(ms: number): string {
  const p = etParts(ms);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[p.dow]} ${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET`;
}

/** UTC offset in hours for New York at an instant (e.g. -4 for EDT, -5 for EST). */
export function etOffsetHours(ms: number): number {
  const p = etParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - floorToMinute(ms)) / HOUR);
}

function floorToMinute(ms: number): number {
  return Math.floor(ms / MIN) * MIN;
}
