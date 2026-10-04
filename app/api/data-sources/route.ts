import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler, parseJson } from "@/lib/http";
import { sourceNameSchema } from "@/lib/schemas";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

/** Register an authorised API / live-feed source. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "sources", limit: 20, admin: true });
  const body = await parseJson(
    req,
    z.object({
      source_name: sourceNameSchema,
      source_type: z.enum(["api", "live_feed"]),
      notes: z.string().max(2000).optional(),
    }),
    5_000,
  );
  const src = await getRepository().upsertDataSource({ ...body, enabled: false, notes: body.notes ?? null });
  return NextResponse.json({ source: src }, { status: 201 });
});
