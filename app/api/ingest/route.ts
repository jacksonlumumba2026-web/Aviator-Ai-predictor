import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "@/lib/auth";
import { env } from "@/lib/env";
import { guard, handler, HttpError, parseJson } from "@/lib/http";
import { ingestSchema } from "@/lib/schemas";
import { ingestRounds } from "@/services/ingestion";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

/**
 * Server-to-server ingestion for an AUTHORISED data source (one you have the
 * right to use, e.g. an official results API or your own records).
 *
 *   POST /api/ingest
 *   Authorization: Bearer $INGEST_API_KEY
 *   { "source_name": "my_feed", "rounds": [{ "multiplier": 1.84, "round_time": "..." }] }
 *
 * The source must be registered and enabled in Settings → Data sources.
 */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "ingest", limit: 240 });
  if (!env.ingestApiKey) throw new HttpError(503, "Ingestion disabled: INGEST_API_KEY is not set.");
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, env.ingestApiKey)) throw new HttpError(401, "Invalid ingestion key.");

  const body = await parseJson(req, ingestSchema, 200_000);
  const src = await getRepository().getDataSource(body.source_name);
  if (!src || !(src.source_type === "live_feed" || src.source_type === "api")) {
    throw new HttpError(403, `Unknown source "${body.source_name}". Register it in Settings → Data sources first.`);
  }
  if (!src.enabled) throw new HttpError(403, `Source "${body.source_name}" is disabled.`);
  const future = body.rounds.find((r) => Date.parse(r.round_time) > Date.now() + 60_000);
  if (future) throw new HttpError(400, "round_time cannot be in the future");

  const result = await ingestRounds({
    rows: [...body.rounds].sort((a, b) => (a.round_time < b.round_time ? -1 : 1)),
    source: src.source_name,
    sourceType: src.source_type,
    dataset: "real",
  });
  return NextResponse.json(result);
});
