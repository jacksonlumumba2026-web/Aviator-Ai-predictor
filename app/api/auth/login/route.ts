import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authMode, createSessionToken, SESSION_COOKIE, sessionCookieOptions, timingSafeEqual } from "@/lib/auth";
import { env } from "@/lib/env";
import { guard, handler, HttpError, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "login", limit: 5 });
  if (authMode() !== "password") throw new HttpError(400, "ADMIN_PASSWORD is not configured on the server.");
  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(256) }), 2_000);
  if (!timingSafeEqual(password, env.adminPassword)) throw new HttpError(401, "Incorrect password.");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
});
