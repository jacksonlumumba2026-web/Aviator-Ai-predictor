import { NextResponse, type NextRequest } from "next/server";
import { guard, handler } from "@/lib/http";
import { getDataset } from "@/services/dataset";
import { generateNextEstimate } from "@/services/prediction";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "predict", limit: 20, admin: true });
  const { prediction, created } = await generateNextEstimate(await getDataset());
  return NextResponse.json({ prediction, created, disclaimer: "Experimental statistical estimate — not a guaranteed prediction." });
});
