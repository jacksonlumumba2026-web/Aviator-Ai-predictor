import "server-only";
import { cookies } from "next/headers";
import { env } from "./env";

export const SESSION_COOKIE = "aal_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function secret(): string {
  return env.sessionSecret || (env.adminPassword ? `derived:${env.adminPassword}` : "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Buffer.from(sig).toString("base64url");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export type AuthMode = "password" | "open-dev" | "locked";

/** password: ADMIN_PASSWORD set; open-dev: unset in development; locked: unset in production. */
export function authMode(): AuthMode {
  if (env.adminPassword) return "password";
  return env.isProduction ? "locked" : "open-dev";
}

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  return `${expires}.${await hmac(`admin.${expires}`)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;
  const [exp, sig] = token.split(".");
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(`admin.${expires}`));
}

export async function isAdmin(): Promise<boolean> {
  const mode = authMode();
  if (mode === "open-dev") return true;
  if (mode === "locked") return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: env.isProduction,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
