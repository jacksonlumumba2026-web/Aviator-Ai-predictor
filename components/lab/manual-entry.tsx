"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";

const field = "mt-1.5 block h-10 w-full rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand";

export function ManualEntry({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [multiplier, setMultiplier] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m < 1) {
      setMsg({ ok: false, text: "Multiplier must be a number ≥ 1.00" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ multiplier: m, round_time: time ? new Date(time).toISOString() : undefined, source: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setMsg({ ok: true, text: `Saved ${m.toFixed(2)}x${data.newEstimate ? " · new estimate generated" : ""}` });
      setMultiplier("");
      setTime("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-ink-3">
          Multiplier
          <input
            inputMode="decimal"
            placeholder="e.g. 1.84"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className={field}
            required
            aria-describedby="mult-help"
          />
          <span id="mult-help" className="mt-1 block text-[11px]">
            ≥ 1.00, two decimals
          </span>
        </label>
        <label className="text-xs text-ink-3">
          Round time (your local time)
          <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} [color-scheme:dark]`} />
          <span className="mt-1 block text-[11px]">Leave empty for “now”</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" loading={loading} disabled={disabled}>
          Add round
        </Button>
        {msg && (
          <p role="status" className={msg.ok ? "flex items-center gap-1.5 text-sm text-good-ink" : "text-sm text-bad-ink"}>
            {msg.ok && <CheckCircle2 className="size-4" />}
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
