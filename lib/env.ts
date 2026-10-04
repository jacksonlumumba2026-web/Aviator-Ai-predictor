import "server-only";

/** Server-side environment. Never import this module from client components. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  mlServiceUrl: (process.env.ML_SERVICE_URL || "").replace(/\/+$/, ""),
  mlServiceToken: process.env.ML_SERVICE_TOKEN || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  ingestApiKey: process.env.INGEST_API_KEY || "",
  autoPredict: (process.env.AUTO_PREDICT ?? "true") !== "false",
  isProduction: process.env.NODE_ENV === "production",
};

export const supabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const realtimeConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const mlConfigured = () => Boolean(env.mlServiceUrl);
