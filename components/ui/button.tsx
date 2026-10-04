"use client";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

const variants = {
  primary:
    "bg-gradient-to-b from-[#8a99ff] to-[#6274f5] text-white shadow-[0_8px_24px_-8px_rgb(123_140_255/0.6),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-110",
  secondary: "border border-line-strong bg-white/[0.04] text-ink hover:bg-white/[0.08]",
  ghost: "text-ink-2 hover:bg-white/[0.05] hover:text-ink",
  danger: "border border-bad/40 bg-bad/10 text-bad-ink hover:bg-bad/20",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
