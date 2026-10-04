"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, RefreshCw } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Keeps the Live page current. With Supabase Realtime configured it listens for
 * INSERTs on aviator_rounds / predictions (read-only anon key, RLS enforced);
 * otherwise it falls back to polling the server. Never contacts third parties.
 */
export function LiveRefresher({ isDemo, pollMs = 15_000 }: { isDemo: boolean; pollMs?: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"realtime" | "polling">("polling");
  const [lastEvent, setLastEvent] = useState<Date | null>(null);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (poll) return;
      setMode("polling");
      poll = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, pollMs);
    };
    const sb = getBrowserClient();
    if (!sb) {
      startPolling();
      return () => {
        if (poll) clearInterval(poll);
      };
    }
    const filter = `is_demo=eq.${isDemo}`;
    const onChange = () => {
      setLastEvent(new Date());
      router.refresh();
    };
    const channel = sb
      .channel(`live-${isDemo ? "demo" : "real"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "aviator_rounds", filter }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter }, onChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (poll) clearInterval(poll);
          poll = null;
          setMode("realtime");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling(); // never silently stop updating
        }
      });
    return () => {
      if (poll) clearInterval(poll);
      sb.removeChannel(channel);
    };
  }, [isDemo, pollMs, router]);

  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3">
      {mode === "realtime" ? <Radio className="size-3.5 text-good-ink" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
      {mode === "realtime" ? "Realtime subscription active" : `Refreshing stored data every ${pollMs / 1000}s`}
      {lastEvent && <span>· last update {lastEvent.toLocaleTimeString()}</span>}
    </span>
  );
}
