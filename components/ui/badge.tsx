import { cn } from "./cn";

const tones = {
  neutral: "border-line-strong bg-white/[0.04] text-ink-2",
  brand: "border-brand/30 bg-brand/10 text-[#b9c2ff]",
  good: "border-good/40 bg-good/10 text-good-ink",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad-ink",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
