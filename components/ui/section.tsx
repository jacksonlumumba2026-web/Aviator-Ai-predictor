import { Reveal } from "./reveal";
import { cn } from "./cn";

/** Vertical rhythm between page sections. */
export function Section({ className, delay = 0, ...props }: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return (
    <Reveal delay={delay} className={cn("mb-6 md:mb-8", className)}>
      <div {...props} />
    </Reveal>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mt-14 mb-5 flex items-end justify-between gap-4 md:mt-20">
      <h2 className="text-lg font-semibold tracking-tight text-ink md:text-xl">{children}</h2>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
