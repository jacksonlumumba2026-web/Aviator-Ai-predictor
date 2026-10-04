"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { DataSource } from "@/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

export function DataSources({ sources, canEdit }: { sources: DataSource[]; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"api" | "live_feed">("live_feed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: DataSource) {
    const res = await fetch(`/api/data-sources/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (!res.ok) setError((await res.json()).error);
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/data-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_name: name, source_type: type, notes: notes || undefined }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error + (body.details ? `: ${body.details.map((d: { message: string }) => d.message).join(", ")}` : ""));
    setName("");
    setNotes("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {s.source_name} <Badge tone={s.source_type === "demo" ? "warn" : "neutral"}>{s.source_type}</Badge>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {s.notes ?? "—"} · last update {s.last_update ? s.last_update.replace("T", " ").slice(0, 19) + " UTC" : "never"}
              </p>
            </div>
            <button
              disabled={!canEdit}
              onClick={() => toggle(s)}
              role="switch"
              aria-checked={s.enabled}
              aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.source_name}`}
              className={cn(
                "relative h-6 w-11 rounded-full border transition disabled:opacity-40",
                s.enabled ? "border-brand/50 bg-brand/40" : "border-line-strong bg-white/[0.05]",
              )}
            >
              <span className={cn("absolute top-0.5 size-4.5 rounded-full bg-white transition-all", s.enabled ? "left-[22px]" : "left-0.5")} />
            </button>
          </li>
        ))}
      </ul>

      {canEdit && (
        <form onSubmit={add} className="grid gap-3 rounded-2xl border border-dashed border-line-strong p-5 sm:grid-cols-[1fr_160px] lg:grid-cols-[1fr_160px_1.4fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="source_name (e.g. official_results_api)"
            className="h-10 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand"
            required
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "api" | "live_feed")}
            className="h-10 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink [color-scheme:dark]"
          >
            <option value="live_feed">live_feed</option>
            <option value="api">api</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Authorisation / terms reference"
            className="h-10 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand"
          />
          <Button type="submit">
            <Plus className="size-4" /> Register
          </Button>
          <p className="text-xs text-ink-3 sm:col-span-2 lg:col-span-4">
            New sources start disabled. Only register sources you are authorised to use; enable once the integration is approved.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad-ink">
          {error}
        </p>
      )}
    </div>
  );
}
