import { describe, expect, it } from "vitest";
import { runResearch, UserFacingError } from "@/server/service";

const intention = { symbol: "RNVDAUSDT", intent: "HOLD" as const, holdingUsdt: 2000, tradeUsdt: null, limitPrice: null };

describe("research request errors", () => {
  it("an unknown replay date is a 400 request error that suggests the Saturday key, not a provider failure", async () => {
    const err = await runResearch({ mode: "replay", replayKey: "2026-09-25", intention }).catch((e) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.status).toBe(400);
    expect(err.message).toContain("did you mean 2026-09-26?");
    expect(err.fields).toEqual([{ field: "replayKey", message: "Use 2026-09-26" }]);
  });

  it("a date far from any weekend is still a 400, without a suggestion", async () => {
    const err = await runResearch({ mode: "replay", replayKey: "2020-01-01", intention }).catch((e) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain("did you mean");
  });

  it("the valid Saturday key still replays and stands down on the saved data", async () => {
    const res = await runResearch({ mode: "replay", replayKey: "2026-09-26", intention });
    expect(res.card.action).toBe("STAND_DOWN");
    expect(res.card.signal.matchedCount).toBe(1);
  });
});
