import type { Intent } from "./intent";

/** The chosen exploration range for the underlying reopening gap. Not a loss bound and not Bitget's order band. */
export const SCENARIO_MIN = -0.2;
export const SCENARIO_MAX = 0.2;

export interface ScenarioInput {
  intent: Intent;
  /** Official underlying close on the last trading day before the weekend (USD). */
  underlyingFridayClose: number | null;
  /** Hypothetical underlying reopening gap relative to that close, e.g. -0.05. */
  underlyingGap: number;
  /** Assumed token-versus-stock basis at the endpoint, e.g. -0.001 means the token trades 0.1% below the stock. */
  basis: number | null;
  decisionPrice: number | null;
  /** Modeled clip in USDT (0 for STAND DOWN). */
  modeledClipUsdt: number;
  /** Full intended amount in USDT. */
  intendedUsdt: number | null;
  holdingUsdt: number | null;
}

export interface ScenarioResult {
  enabled: boolean;
  disabledReason: string | null;
  underlyingImplied: number | null;
  tokenEndpointImplied: number | null;
  tokenReturnFromDecision: number | null;
  /** Hypothetical P&L of the modeled clip versus no proposed trade, before costs. */
  modeledPnl: number | null;
  intendedPnl: number | null;
  /** Mark-to-scenario change of the existing holding if nothing is done. */
  holdingChange: number | null;
}

/**
 * Hypothetical scenario. It never touches historical evidence or the deterministic action.
 * Token endpoint implied = underlying close * (1 + gap) * (1 + basis).
 */
export function runScenario(s: ScenarioInput): ScenarioResult {
  const off = (reason: string): ScenarioResult => ({
    enabled: false, disabledReason: reason, underlyingImplied: null, tokenEndpointImplied: null, tokenReturnFromDecision: null,
    modeledPnl: null, intendedPnl: null, holdingChange: null,
  });
  if (s.underlyingGap < SCENARIO_MIN || s.underlyingGap > SCENARIO_MAX) return off("Gap outside the chosen exploration range");
  if (s.underlyingFridayClose === null) return off("The underlying official Friday close is UNKNOWN, so a stock-linked scenario cannot be computed");
  if (s.basis === null || !Number.isFinite(s.basis)) return off("The token-versus-stock basis assumption is missing");
  if (s.decisionPrice === null) return off("No verified token decision price");
  const underlyingImplied = s.underlyingFridayClose * (1 + s.underlyingGap);
  const tokenEndpointImplied = underlyingImplied * (1 + s.basis);
  const ret = tokenEndpointImplied / s.decisionPrice - 1;
  const direction = s.intent === "BUY_DIP" ? 1 : -1; // buying gains when price rises; selling avoids the move
  return {
    enabled: true,
    disabledReason: null,
    underlyingImplied,
    tokenEndpointImplied,
    tokenReturnFromDecision: ret,
    modeledPnl: direction * s.modeledClipUsdt * ret,
    intendedPnl: s.intendedUsdt !== null ? direction * s.intendedUsdt * ret : null,
    holdingChange: s.holdingUsdt !== null ? s.holdingUsdt * ret : null,
  };
}
