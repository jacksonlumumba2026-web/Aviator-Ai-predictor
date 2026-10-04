"use client";

export function TooltipBox({ title, rows }: { title: React.ReactNode; rows: { label: string; value: React.ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line-strong bg-[#11141b]/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-6 text-ink-2">
          <span className="flex items-center gap-2">
            {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium text-ink tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
