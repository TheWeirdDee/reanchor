import { NextResponse } from "next/server";
import { meta } from "@/server/service";
import { modelStatus } from "@/server/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const m = meta();
  const ms = modelStatus();
  return NextResponse.json({ ...m, model: { available: ms.available, model: ms.model, reason: ms.reason } });
}
