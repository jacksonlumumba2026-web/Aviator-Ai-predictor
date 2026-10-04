import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guard, handler, parseJson } from "@/lib/http";
import { getDataset } from "@/services/dataset";
import { protocolStatus, startStage } from "@/services/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "validation-read", limit: 120 });
  return NextResponse.json(await protocolStatus(await getDataset()));
});

/** Start a frozen-protocol stage. Each window can be evaluated once. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "validation-start", limit: 5, admin: true });
  const body = await parseJson(
    req,
    z.object({
      stage: z.enum(["final_test", "confirmation"]),
      acknowledge: z.literal(true, { message: "acknowledge that this window can only be evaluated once" }),
      overrides: z.record(z.string(), z.number().int().positive()).optional(),
    }),
    5_000,
  );
  const run = await startStage(await getDataset(), body.stage, body.overrides);
  return NextResponse.json({ run }, { status: 202 });
});
