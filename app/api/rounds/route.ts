import { NextResponse, type NextRequest } from "next/server";
import { guard, handler, HttpError, parseJson } from "@/lib/http";
import { deleteRoundsSchema, manualRoundSchema, roundFilterSchema } from "@/lib/schemas";
import { getDataset } from "@/services/dataset";
import { ingestRounds } from "@/services/ingestion";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "rounds-read", limit: 120 });
  const sp = req.nextUrl.searchParams;
  const f = roundFilterSchema.parse(Object.fromEntries([...sp.entries()].filter(([k, v]) => v && ["from", "to", "min", "max", "source"].includes(k))));
  const limit = Math.min(Number(sp.get("limit")) || 50, 500);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const dataset = await getDataset();
  const page = await getRepository().listRounds(
    { dataset, from: f.from, to: f.to, minMultiplier: f.min, maxMultiplier: f.max, source: f.source },
    { limit, offset, order: "desc" },
  );
  return NextResponse.json({ dataset, ...page });
});

/** Manual entry of a single round into the REAL dataset. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "rounds-write", limit: 60, admin: true });
  const body = await parseJson(req, manualRoundSchema, 10_000);
  const round_time = body.round_time ?? new Date().toISOString();
  if (Date.parse(round_time) > Date.now() + 60_000) throw new HttpError(400, "round_time cannot be in the future");
  const result = await ingestRounds({
    rows: [{ multiplier: body.multiplier, round_time }],
    source: body.source,
    sourceType: "manual",
    dataset: "real",
  });
  if (!result.inserted) throw new HttpError(409, "A round with this round_time already exists.");
  return NextResponse.json(result, { status: 201 });
});

export const DELETE = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "rounds-write", limit: 30, admin: true });
  const { ids } = await parseJson(req, deleteRoundsSchema, 200_000);
  const dataset = await getDataset();
  const deleted = await getRepository().deleteRounds(dataset, ids);
  return NextResponse.json({ deleted });
});
