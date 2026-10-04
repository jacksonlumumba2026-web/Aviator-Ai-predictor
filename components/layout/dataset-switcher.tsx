"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Dataset } from "@/types";
import { cn } from "../ui/cn";

export function DatasetSwitcher({ dataset, counts }: { dataset: Dataset; counts: Record<Dataset, number> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (d: Dataset) =>
    start(async () => {
      await fetch("/api/settings/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: d }),
      });
      router.refresh();
    });

  return (
    <div className={cn("rounded-2xl border border-line bg-white/[0.02] p-1", pending && "opacity-60")} role="radiogroup" aria-label="Dataset">
      <div className="grid grid-cols-2 gap-1">
        {(["real", "demo"] as const).map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={dataset === d}
            onClick={() => choose(d)}
            className={cn(
              "rounded-xl px-3 py-2 text-left transition",
              dataset === d ? (d === "demo" ? "bg-warn/15 text-warn" : "bg-white/[0.08] text-ink") : "text-ink-3 hover:text-ink-2",
            )}
          >
            <span className="block text-xs font-semibold">{d === "real" ? "Real data" : "Demo data"}</span>
            <span className="block text-[10px] tabular opacity-80">{counts[d].toLocaleString("en-US")} rounds</span>
          </button>
        ))}
      </div>
    </div>
  );
}
