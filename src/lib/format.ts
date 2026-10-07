import { fmtEt } from "../domain/time";

export { fmtEt };

export function fmtUsdt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} USDT`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const s = (v * 100).toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function fmtSignedUsdt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export function fmtEtOrNa(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "n/a" : fmtEt(ms);
}

export const ACTION_LABEL: Record<string, string> = { TRIM: "TRIM", FADE: "FADE", STAND_DOWN: "STAND DOWN" };

/** Readable calendar date from YYYY-MM-DD, e.g. "Fri 25 Sep 2026". Calendar dates are timezone-free. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${wd} ${d} ${mo} ${y}`;
}
