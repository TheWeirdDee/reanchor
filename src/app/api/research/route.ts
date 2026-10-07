import { NextResponse } from "next/server";
import { ResearchRequest, runResearch, UserFacingError } from "@/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = ResearchRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid research request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  try {
    return NextResponse.json(await runResearch(parsed.data));
  } catch (e) {
    if (e instanceof UserFacingError) return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status });
    console.error("research failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Research could not be completed. A provider may be unavailable; try a replay." }, { status: 502 });
  }
}
