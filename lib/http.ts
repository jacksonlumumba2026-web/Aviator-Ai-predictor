import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { authMode, isAdmin } from "./auth";
import { rateLimit } from "./rate-limit";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

interface GuardOptions {
  /** Requests per minute per IP for this bucket. */
  limit?: number;
  bucket: string;
  admin?: boolean;
}

export async function guard(req: NextRequest, opts: GuardOptions) {
  const rl = rateLimit(`${opts.bucket}:${clientIp(req)}`, opts.limit ?? 60);
  if (!rl.ok) throw new HttpError(429, `Too many requests — retry in ${rl.retryAfter}s`);
  if (opts.admin && !(await isAdmin())) {
    throw new HttpError(
      401,
      authMode() === "locked"
        ? "Write access is disabled: set ADMIN_PASSWORD on the server."
        : "Admin sign-in required (Settings → Admin access).",
    );
  }
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>, maxBytes = 1_000_000): Promise<T> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(413, "Request body too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request body too large");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  return schema.parse(data);
}

/** Wrap a route handler with uniform error handling. Never leaks stack traces. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 400 },
        );
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
