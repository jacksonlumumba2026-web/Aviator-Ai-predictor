import { NextResponse } from "next/server";
import { mlConfigured, realtimeConfigured, supabaseConfigured } from "@/lib/env";
import { handler } from "@/lib/http";
import { mlHealth } from "@/services/ml-client";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  let ml: unknown = { status: "not_configured" };
  if (mlConfigured()) ml = await mlHealth().catch((e: Error) => ({ status: "unreachable", error: e.message }));
  return NextResponse.json({
    status: "ok",
    storage: supabaseConfigured() ? "supabase" : "local-dev-store",
    realtime: realtimeConfigured(),
    ml,
  });
});
