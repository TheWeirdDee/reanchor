import { NextResponse } from "next/server";
import { ResearchRequest, runResearch, UserFacingError } from "@/server/service";
import { factsFromCard } from "@/server/facts";
import { CASE_FALLBACK, explainCard } from "@/server/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recomputes the card server-side so the explanation is grounded in server-computed numbers only. */
export async function POST(req: Request) {
  const parsed = ResearchRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, fallback: CASE_FALLBACK, error: "Invalid request" }, { status: 400 });
  try {
    const { card } = await runResearch(parsed.data);
    const r = await explainCard(factsFromCard(card));
    if (!r.ok) return NextResponse.json({ ok: false, fallback: CASE_FALLBACK, error: r.error });
    return NextResponse.json({ ok: true, sentences: r.sentences, model: r.model, cached: r.cached, action: card.action });
  } catch (e) {
    const msg = e instanceof UserFacingError ? e.message : "Explanation unavailable";
    return NextResponse.json({ ok: false, fallback: CASE_FALLBACK, error: msg });
  }
}
