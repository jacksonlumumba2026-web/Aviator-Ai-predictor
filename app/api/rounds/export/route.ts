import { type NextRequest } from "next/server";
import { roundsToCsv } from "@/lib/csv";
import { guard, handler } from "@/lib/http";
import { roundFilterSchema } from "@/lib/schemas";
import { getDataset } from "@/services/dataset";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "export", limit: 10 });
  const sp = req.nextUrl.searchParams;
  const f = roundFilterSchema.parse(Object.fromEntries([...sp.entries()].filter(([k, v]) => v && ["from", "to", "min", "max", "source"].includes(k))));
  const dataset = await getDataset();
  const rows = await getRepository().allRounds({ dataset, from: f.from, to: f.to, minMultiplier: f.min, maxMultiplier: f.max, source: f.source });
  const prefix = dataset === "demo" ? "# DEMO DATA — NOT REAL GAME RESULTS\n" : "";
  const name = dataset === "demo" ? "DEMO_DATA_NOT_REAL_rounds.csv" : `aviator_rounds_${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(prefix + roundsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
