import { NextResponse } from "next/server";
import { z } from "zod";
import { extractIntent } from "@/server/model";
import { datasetAvailable, loadDataset } from "@/server/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(3).max(1000) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Type a sentence between 3 and 1000 characters" }, { status: 400 });
  if (!datasetAvailable()) return NextResponse.json({ ok: false, error: "Research dataset unavailable" }, { status: 503 });
  const ds = loadDataset();
  const coins = ds.supported.map((i) => i.baseCoin);
  const r = await extractIntent(body.data.text, coins);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 });
  const inst = ds.supported.find((i) => i.baseCoin === r.extraction.instrument);
  return NextResponse.json({ ok: true, model: r.model, extraction: { ...r.extraction, symbol: inst?.symbol ?? null } });
}
