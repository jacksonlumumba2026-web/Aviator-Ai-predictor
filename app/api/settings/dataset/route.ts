import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler, parseJson } from "@/lib/http";
import { datasetSchema } from "@/lib/schemas";
import { DATASET_COOKIE } from "@/services/dataset";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "settings", limit: 30 });
  const { dataset } = await parseJson(req, z.object({ dataset: datasetSchema }), 1_000);
  const res = NextResponse.json({ dataset });
  res.cookies.set(DATASET_COOKIE, dataset, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
