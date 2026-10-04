import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler } from "@/lib/http";
import { refreshRun } from "@/services/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await guard(req, { bucket: "validation-poll", limit: 240 });
  const { id } = await ctx.params;
  const run = await refreshRun(z.string().uuid().parse(id));
  return NextResponse.json({ run: { ...run, result: run.result ? { classification: run.classification } : null } });
});
