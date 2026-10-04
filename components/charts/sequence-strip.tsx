import { cn } from "../ui/cn";

/** Sequential single-hue encoding by multiplier magnitude; the value is always printed. */
function tone(m: number) {
  if (m >= 10) return "bg-[#3987e5] text-white border-[#5598e7]";
  if (m >= 5) return "bg-[#256abf] text-white border-[#3987e5]";
  if (m >= 3) return "bg-[#1c5cab]/80 text-white border-[#2a78d6]/60";
  if (m >= 2) return "bg-[#184f95]/60 text-ink border-[#256abf]/50";
  if (m >= 1.5) return "bg-white/[0.06] text-ink border-line-strong";
  return "bg-white/[0.02] text-ink-2 border-line";
}

export function SequenceStrip({ values, className }: { values: { multiplier: number; round_time: string }[]; className?: string }) {
  return (
    <div className={className}>
      <ol className="flex flex-wrap gap-1.5" aria-label="Recent rounds, oldest first">
        {values.map((v, i) => (
          <li
            key={v.round_time}
            title={new Date(v.round_time).toISOString()}
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] font-medium tabular transition-transform hover:-translate-y-0.5",
              tone(v.multiplier),
              i === values.length - 1 && "ring-2 ring-brand/60 ring-offset-2 ring-offset-bg",
            )}
          >
            {v.multiplier.toFixed(2)}x
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-3">
        <span>Shade = magnitude:</span>
        {[
          ["<1.5x", "bg-white/[0.02] border-line"],
          ["≥1.5x", "bg-white/[0.06] border-line-strong"],
          ["≥2x", "bg-[#184f95]/60 border-[#256abf]/50"],
          ["≥3x", "bg-[#1c5cab]/80 border-[#2a78d6]/60"],
          ["≥5x", "bg-[#256abf] border-[#3987e5]"],
          ["≥10x", "bg-[#3987e5] border-[#5598e7]"],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded border", c)} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
