import { NextResponse, type NextRequest } from "next/server";
import { generateDemoRounds, DEMO_SOURCE } from "@/lib/demo";
import { guard, handler } from "@/lib/http";
import { ingestRounds } from "@/services/ingestion";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

/** Load the synthetic DEMO dataset (is_demo = true). Never mixed with real data. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "demo", limit: 5, admin: true });
  const result = await ingestRounds({ rows: generateDemoRounds(), source: DEMO_SOURCE, sourceType: "demo", dataset: "demo", autoPredict: false });
  const res = NextResponse.json({ ...result, label: "DEMO DATA — NOT REAL GAME RESULTS" });
  res.cookies.set("aal_dataset", "demo", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
});

/** Remove all demo rounds, demo model runs and demo predictions. */
export const DELETE = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "demo", limit: 5, admin: true });
  const repo = getRepository();
  await repo.deletePredictions("demo");
  await repo.deleteModelRuns("demo");
  const deleted = await repo.deleteAllRounds("demo");
  return NextResponse.json({ deleted });
});
