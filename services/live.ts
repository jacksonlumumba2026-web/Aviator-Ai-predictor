import "server-only";
import { LIVE_STALE_MS } from "@/lib/constants";
import { realtimeConfigured } from "@/lib/env";
import type { DataSource } from "@/types";
import { getRepository } from "./repository";

export interface LiveStatus {
  connected: boolean;
  sources: DataSource[];
  realtime: boolean;
}

/** A live feed is "connected" only if an enabled, authorised source delivered recently. */
export async function getLiveStatus(): Promise<LiveStatus> {
  const sources = (await getRepository().listDataSources()).filter(
    (s) => s.source_type === "live_feed" || s.source_type === "api",
  );
  const connected = sources.some(
    (s) => s.enabled && s.last_update && Date.now() - new Date(s.last_update).getTime() < LIVE_STALE_MS,
  );
  return { connected, sources, realtime: realtimeConfigured() };
}
