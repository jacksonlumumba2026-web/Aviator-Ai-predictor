"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Dataset } from "@/types";
import { cn } from "../ui/cn";

const OPTIONS: { d: Dataset; label: string; on: string }[] = [
  { d: "real", label: "Real", on: "bg-series-1/20 text-[#9ec5f4]" },
  { d: "demo", label: "Demo", on: "bg-warn/15 text-warn" },
  { d: "test", label: "Test", on: "bg-[#b48cff]/15 text-[#d4bfff]" },
];

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
      <div className="grid grid-cols-3 gap-1">
        {OPTIONS.map(({ d, label, on }) => (
          <button
            key={d}
            role="radio"
            aria-checked={dataset === d}
            onClick={() => choose(d)}
            className={cn("rounded-xl px-2 py-2 text-left transition", dataset === d ? on : "text-ink-3 hover:text-ink-2")}
          >
            <span className="block text-xs font-semibold">{label}</span>
            <span className="block text-[10px] tabular opacity-80">{counts[d].toLocaleString("en-US")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
