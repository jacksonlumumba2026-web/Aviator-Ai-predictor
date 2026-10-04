import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler } from "@/lib/http";
import { auditPrediction } from "@/services/audit";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await guard(req, { bucket: "audit", limit: 60 });
  const { id } = await ctx.params;
  return NextResponse.json(await auditPrediction(z.string().uuid().parse(id)));
});
