import { AlertTriangle, FlaskConical, ShieldCheck } from "lucide-react";
import type { Dataset } from "@/types";
import { cn } from "../ui/cn";

export const PROVENANCE = {
  real: {
    short: "REAL DATA",
    long: "REAL DATA — attested, legitimately obtained game observations",
    icon: ShieldCheck,
    chip: "border-series-1/50 bg-series-1/15 text-[#9ec5f4]",
    bar: "border-series-1/30 bg-series-1/[0.08] text-[#9ec5f4]",
  },
  demo: {
    short: "DEMO DATA",
    long: "DEMO DATA — NOT REAL GAME RESULTS (synthetic demonstration)",
    icon: AlertTriangle,
    chip: "border-warn/50 bg-warn/15 text-warn",
    bar: "demo-stripes border-warn/30 text-warn",
  },
  test: {
    short: "TEST DATA",
    long: "TEST DATA — synthetic / fixture data for testing, NOT REAL GAME RESULTS",
    icon: FlaskConical,
    chip: "border-[#b48cff]/50 bg-[#b48cff]/15 text-[#d4bfff]",
    bar: "test-stripes border-[#b48cff]/30 text-[#d4bfff]",
  },
} as const;

/** Compact provenance chip. */
export function ProvenanceChip({ dataset, className }: { dataset: Dataset; className?: string }) {
  const p = PROVENANCE[dataset];
  const Icon = p.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.14em]", p.chip, className)}
      title={p.long}
    >
      <Icon className="size-3.5" aria-hidden />
      {p.short}
    </span>
  );
}

/** Full-width, always-visible provenance bar. */
export function ProvenanceBar({ dataset, rounds }: { dataset: Dataset; rounds: number }) {
  const p = PROVENANCE[dataset];
  const Icon = p.icon;
  return (
    <div role="status" aria-label={`Dataset: ${p.short}`} className={cn("border-b", p.bar)}>
      <div className="mx-auto flex max-w-[1240px] items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-semibold tracking-[0.12em] uppercase sm:text-xs">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{p.long}</span>
        <span className="hidden font-medium opacity-70 sm:inline">· {rounds.toLocaleString("en-US")} rounds</span>
      </div>
    </div>
  );
}
