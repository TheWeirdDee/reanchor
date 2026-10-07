/** Classify stand-down reasons into stable cause codes. Shared by the audit script and the site. */
export type Cause =
  | "INADEQUATE_SAMPLE"
  | "MISSING_TURNOVER"
  | "STALE_DATA"
  | "CONFLICT_THRESHOLD"
  | "DIRECTION_NOT_REVERSAL"
  | "MOVE_NOT_EXTREME"
  | "INCOMPATIBLE_DIRECTION"
  | "SIZE_LIMIT"
  | "MISSING_BOUNDARY"
  | "REFERENCE_LIMIT_UNAVAILABLE"
  | "NONSTANDARD_WEEKEND"
  | "SESSION_NOT_VERIFIED"
  | "CORPORATE_ACTION"
  | "OTHER";

export const CAUSE_LABEL: Record<Cause, string> = {
  INADEQUATE_SAMPLE: "Too few comparable prior weekends",
  MISSING_TURNOVER: "Weekend turnover too thin to size a clip",
  STALE_DATA: "Latest weekend price too old",
  CONFLICT_THRESHOLD: "Prior weekends disagree on direction",
  DIRECTION_NOT_REVERSAL: "Prior weekends did not reverse",
  MOVE_NOT_EXTREME: "Weekend move was not extreme",
  INCOMPATIBLE_DIRECTION: "Move direction does not fit the intent",
  SIZE_LIMIT: "Proposed size too large for weekend activity",
  MISSING_BOUNDARY: "A required price boundary is missing",
  REFERENCE_LIMIT_UNAVAILABLE: "No limit price could be set (missing decision price)",
  NONSTANDARD_WEEKEND: "Holiday or early-close weekend",
  SESSION_NOT_VERIFIED: "Session clock or calendar not verified",
  CORPORATE_ACTION: "Corporate action or unknown corporate-action status",
  OTHER: "Other",
};

export function classifyReason(r: string): Cause {
  if (/eligible prior episodes|matched same-direction extreme/.test(r)) return "INADEQUATE_SAMPLE";
  if (/H_t unavailable/.test(r)) return "MISSING_TURNOVER";
  if (/minutes old|No closed 15m weekend bar/.test(r)) return "STALE_DATA";
  if (/conflicting/.test(r)) return "CONFLICT_THRESHOLD";
  if (/continuation|inconclusive/.test(r)) return "DIRECTION_NOT_REVERSAL";
  if (/is not beyond the historical 70th-percentile threshold/.test(r)) return "MOVE_NOT_EXTREME";
  if (/requires an extreme|does not map to a trim/.test(r)) return "INCOMPATIBLE_DIRECTION";
  if (/hard limit 25%|minimum order|below the minimum/.test(r)) return "SIZE_LIMIT";
  if (/Missing the 15m bar|Friday reference/.test(r)) return "MISSING_BOUNDARY";
  if (/limit price is required/.test(r)) return "REFERENCE_LIMIT_UNAVAILABLE";
  if (/Nonstandard weekend/.test(r)) return "NONSTANDARD_WEEKEND";
  if (/Corporate-action/.test(r)) return "CORPORATE_ACTION";
  if (/calendar|clock|session/i.test(r)) return "SESSION_NOT_VERIFIED";
  return "OTHER";
}

export function causesOf(reasons: string[]): Cause[] {
  return [...new Set(reasons.map(classifyReason))];
}
