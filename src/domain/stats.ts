/** Median of a non-empty list; NaN for empty input. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Percentile with linear interpolation between closest ranks
 * (Hyndman-Fan type 7; the default in NumPy and R): position h = (n - 1) * p,
 * result = x[floor(h)] + (h - floor(h)) * (x[floor(h) + 1] - x[floor(h)]).
 */
export function percentileLinear(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  if (p < 0 || p > 1) throw new Error("p must be in [0, 1]");
  const s = [...values].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export function sign(x: number): -1 | 0 | 1 {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** Floor a value to a number of decimal places without floating-point drift upward. */
export function floorToDecimals(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Small epsilon guards against values like 0.29999999999 caused by binary representation.
  return Math.floor(value * f + 1e-9) / f;
}
