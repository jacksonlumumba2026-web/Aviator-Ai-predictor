"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Lock, Play } from "lucide-react";
import { Button } from "../ui/button";

/** Starts a frozen-protocol stage after an explicit once-only acknowledgement. */
export function StartStageButton({ stage, disabled, label }: { stage: "final_test" | "confirmation"; disabled?: boolean; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    const ok = window.confirm(
      stage === "final_test"
        ? "Evaluate the untouched FINAL TEST window now?\n\nThis can be done exactly once under this protocol. The model, features, hyperparameters, targets, baseline and metrics are frozen and cannot be changed afterwards for this window."
        : "Evaluate the CONFIRMATION window now?\n\nIt uses only rounds collected after the final test window, with the same frozen model. It can be done exactly once.",
    );
    if (!ok) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/validation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, acknowledge: true }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(body.error || "Could not start");
    router.refresh();
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="primary" onClick={start} loading={loading} disabled={disabled}>
        {disabled ? <Lock className="size-4" /> : <Play className="size-4" />} {label}
      </Button>
      {error && (
        <p role="alert" className="max-w-md text-xs text-bad-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Polls a running validation run and refreshes the page when it finishes. */
export function RunPoller({ id }: { id: string }) {
  const router = useRouter();
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const t = setInterval(async () => {
      setTicks((n) => n + 1);
      const res = await fetch(`/api/validation/${id}`);
      const body = await res.json().catch(() => ({}));
      if (body.run && body.run.status !== "running") {
        clearInterval(t);
        router.refresh();
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [id, router]);
  return <span className="text-xs text-ink-3">Evaluating… checked {ticks}× (walk-forward over thousands of rounds can take 10–30 min)</span>;
}
