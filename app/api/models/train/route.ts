import { NextResponse, type NextRequest } from "next/server";
import { guard, handler } from "@/lib/http";
import { getDataset } from "@/services/dataset";
import { trainModel } from "@/services/training";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "train", limit: 3, admin: true });
  const run = await trainModel(await getDataset());
  return NextResponse.json({ run: { id: run.id, model_version: run.model_version, verdict: run.verdict } }, { status: 201 });
});
