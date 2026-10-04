import { cn } from "../ui/cn";

export interface ProbabilityRow {
  label: string;
  value: number;
  /** Reference value (e.g. historical base rate) shown as a tick. */
  reference?: number;
  ci?: [number, number];
}

/** Horizontal meters with an optional reference tick and CI whisker. */
export function ProbabilityBars({
  rows,
  referenceLabel = "Historical base rate",
  valueLabel = "Model estimate",
  className,
}: {
  rows: ProbabilityRow[];
  referenceLabel?: string;
  valueLabel?: string;
  className?: string;
}) {
  const hasRef = rows.some((r) => r.reference !== undefined);
  const hasCi = rows.some((r) => r.ci);
  return (
    <div className={className}>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[52px_1fr_56px] items-center gap-3">
            <span className="text-sm font-medium text-ink-2 tabular">{r.label}</span>
            <div className="relative h-2.5 rounded-full bg-white/[0.06]" title={`${valueLabel}: ${(r.value * 100).toFixed(1)}%`}>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#2a6fc4] to-series-1 transition-[width] duration-700"
                style={{ width: `${Math.max(1, r.value * 100)}%` }}
              />
              {r.ci && (
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-ink/70"
                  style={{ left: `${r.ci[0] * 100}%`, width: `${Math.max(0.5, (r.ci[1] - r.ci[0]) * 100)}%` }}
                  aria-hidden
                />
              )}
              {r.reference !== undefined && (
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink ring-2 ring-surface"
                  style={{ left: `calc(${r.reference * 100}% - 1px)` }}
                  title={`${referenceLabel}: ${(r.reference * 100).toFixed(1)}%`}
                  aria-hidden
                />
              )}
            </div>
            <span className="text-right text-sm font-semibold text-ink tabular">{(r.value * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      {(hasRef || hasCi) && (
        <div className={cn("mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-3")}>
          <span className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-series-1" /> {valueLabel}
          </span>
          {hasRef && (
            <span className="flex items-center gap-2">
              <span className="h-3 w-0.5 rounded-full bg-ink" /> {referenceLabel}
            </span>
          )}
          {hasCi && (
            <span className="flex items-center gap-2">
              <span className="h-px w-4 bg-ink/70" /> 95% interval
            </span>
          )}
        </div>
      )}
    </div>
  );
}
