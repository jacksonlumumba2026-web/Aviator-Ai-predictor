"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Filter, Trash2 } from "lucide-react";
import type { Round } from "@/types";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

const field = "h-9 w-full rounded-lg border border-line-strong bg-white/[0.03] px-2.5 text-sm text-ink outline-none focus:border-brand [color-scheme:dark]";
const PAGE = 50;

interface Filters {
  from: string;
  to: string;
  min: string;
  max: string;
  source: string;
}

const empty: Filters = { from: "", to: "", min: "", max: "", source: "" };

function toQuery(f: Filters) {
  const q = new URLSearchParams();
  if (f.from) q.set("from", new Date(f.from).toISOString());
  if (f.to) q.set("to", new Date(f.to).toISOString());
  if (f.min) q.set("min", f.min);
  if (f.max) q.set("max", f.max);
  if (f.source) q.set("source", f.source);
  return q;
}

export function RoundsTable({ canEdit, sources }: { canEdit: boolean; sources: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>(empty);
  const [filters, setFilters] = useState<Filters>(empty);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: Round[]; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const q = toQuery(filters);
    q.set("limit", String(PAGE));
    q.set("offset", String(offset));
    const res = await fetch(`/api/rounds?${q}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Failed to load");
      return;
    }
    setError(null);
    setData(body);
  }, [filters, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change
    load();
  }, [load]);

  async function remove() {
    if (!selected.size || !window.confirm(`Delete ${selected.size} round(s)? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch("/api/rounds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error || "Delete failed");
    setSelected(new Set());
    await load();
    router.refresh();
  }

  const rows = data?.rows ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div>
      <form
        className="grid gap-3 border-b border-line p-6 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setFilters(draft);
        }}
      >
        <label className="text-[11px] text-ink-3 lg:col-span-1">
          From
          <input type="datetime-local" className={field} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="text-[11px] text-ink-3">
          To
          <input type="datetime-local" className={field} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <label className="text-[11px] text-ink-3">
          Min multiplier
          <input inputMode="decimal" className={field} value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} placeholder="1.00" />
        </label>
        <label className="text-[11px] text-ink-3">
          Max multiplier
          <input inputMode="decimal" className={field} value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} placeholder="∞" />
        </label>
        <label className="text-[11px] text-ink-3">
          Source
          <select className={field} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" className="h-9 flex-1">
            <Filter className="size-3.5" /> Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setDraft(empty);
              setFilters(empty);
              setOffset(0);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <p className="text-xs text-ink-3">
          {data ? `${data.total.toLocaleString("en-US")} matching rounds` : "Loading…"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <div className="flex gap-2">
          <a
            href={`/api/rounds/export?${toQuery(filters)}`}
            className="inline-flex h-8 items-center gap-2 rounded-xl border border-line-strong bg-white/[0.04] px-3 text-xs font-medium text-ink hover:bg-white/[0.08]"
          >
            <Download className="size-3.5" /> Export CSV
          </a>
          {canEdit && (
            <Button size="sm" variant="danger" onClick={remove} disabled={!selected.size} loading={busy}>
              <Trash2 className="size-3.5" /> Delete selected
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="px-6 pb-3 text-sm text-bad-ink">
          {error}
        </p>
      )}

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] text-sm tabular">
          <caption className="sr-only">Stored rounds</caption>
          <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
            <tr className="border-y border-line">
              {canEdit && (
                <th className="w-12 px-6 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allChecked}
                    onChange={() => {
                      const next = new Set(selected);
                      rows.forEach((r) => (allChecked ? next.delete(r.id) : next.add(r.id)));
                      setSelected(next);
                    }}
                    className="accent-[#7b8cff]"
                  />
                </th>
              )}
              <th className="px-6 py-3 text-left font-medium">Round time (UTC)</th>
              <th className="px-3 py-3 text-right font-medium">Multiplier</th>
              <th className="px-3 py-3 text-left font-medium">Source</th>
              <th className="px-6 py-3 text-left font-medium">Stored</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-b border-line/60 transition hover:bg-white/[0.02]", selected.has(r.id) && "bg-brand/[0.05]")}>
                {canEdit && (
                  <td className="px-6 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select round ${r.round_time}`}
                      checked={selected.has(r.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        setSelected(next);
                      }}
                      className="accent-[#7b8cff]"
                    />
                  </td>
                )}
                <td className="px-6 py-2.5 text-ink-2">{r.round_time.replace("T", " ").slice(0, 19)}</td>
                <td className={cn("px-3 py-2.5 text-right font-medium", r.multiplier >= 2 ? "text-ink" : "text-ink-2")}>{r.multiplier.toFixed(2)}x</td>
                <td className="px-3 py-2.5 text-ink-3">{r.source}</td>
                <td className="px-6 py-2.5 text-xs text-ink-3">{r.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-ink-3">
                  No rounds match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > PAGE && (
        <div className="flex items-center justify-between px-6 py-4 text-xs text-ink-3">
          <span>
            {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total.toLocaleString("en-US")}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button size="sm" variant="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
