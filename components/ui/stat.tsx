import { cn } from "./cn";

export function Stat({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card card-hover p-5", className)}>
      <div className="flex items-center justify-between text-ink-3">
        <span className="text-[11px] font-medium tracking-[0.14em] uppercase">{label}</span>
        {icon && <span className="text-ink-3 [&>svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-3 text-[28px] leading-none font-semibold tracking-tight text-ink tabular">{value}</div>
      {sub && <div className="mt-2 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}
