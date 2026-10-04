import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler, parseJson } from "@/lib/http";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await guard(req, { bucket: "sources", limit: 30, admin: true });
  const { id } = await ctx.params;
  const patch = await parseJson(req, z.object({ enabled: z.boolean().optional(), notes: z.string().max(2000).optional() }), 5_000);
  await getRepository().updateDataSource(z.string().max(64).parse(id), patch);
  return NextResponse.json({ ok: true });
});
