import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { NO_EDGE_LABEL } from "@/lib/constants";
import type { Verdict } from "@/types";
import { cn } from "../ui/cn";

export const verdictCopy: Record<Verdict, { title: string; body: string }> = {
  no_edge: {
    title: NO_EDGE_LABEL,
    body: "On unseen future rounds the model did not beat the historical base rate by a statistically significant margin. Treat its estimates as no better than the long-run frequencies.",
  },
  edge_detected: {
    title: "A statistically significant out-of-sample improvement was detected.",
    body: "On at least one target the model's probabilities beat the base rate (Brier score, Bonferroni-adjusted) and its ROC-AUC interval excludes 0.5. This is evidence of signal in this sample only — it does not guarantee future outcomes or profit, and should be re-validated on newer data.",
  },
  insufficient_data: {
    title: "Not enough out-of-sample data to judge.",
    body: "The held-out test window is too small (or lacks enough positive and negative outcomes) for a meaningful test. Import more historical rounds and retrain.",
  },
};

export function VerdictBanner({ verdict, compact }: { verdict: Verdict; compact?: boolean }) {
  const Icon = verdict === "edge_detected" ? CheckCircle2 : verdict === "no_edge" ? XCircle : HelpCircle;
  const tone =
    verdict === "edge_detected"
      ? "border-good/40 bg-good/[0.07] text-good-ink"
      : verdict === "no_edge"
        ? "border-bad/40 bg-bad/[0.07] text-bad-ink"
        : "border-warn/40 bg-warn/[0.07] text-warn";
  return (
    <div role="status" className={cn("flex gap-4 rounded-2xl border p-5", tone)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base md:text-lg")}>{verdictCopy[verdict].title}</p>
        {!compact && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{verdictCopy[verdict].body}</p>}
      </div>
    </div>
  );
}
