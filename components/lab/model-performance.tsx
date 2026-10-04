import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Gauge } from "lucide-react";
import type { BacktestEvaluation, SignalLevel } from "@/lib/evaluation";
import { int, num, pct } from "@/lib/format";
import { Card, CardBody } from "../ui/card";
import { cn } from "../ui/cn";

export const NOT_DEMONSTRATED = "Testing has not demonstrated a reliable predictive advantage.";

export const SIGNAL_COPY: Record<SignalLevel, { label: string; tone: string; body: string }> = {
  NO_RELIABLE_EDGE: {
    label: "NO RELIABLE EDGE",
    tone: "border-bad/40 bg-bad/[0.08] text-bad-ink",
    body: "On unseen future rounds the model did not beat the base rate on any target. Treat its estimates as no better than long-run frequencies.",
  },
  WEAK_SIGNAL: {
    label: "WEAK SIGNAL",
    tone: "border-warn/40 bg-warn/[0.08] text-warn",
    body: "One target shows a small, nominally significant improvement that does not survive correction for testing five targets. Under no signal this happens ~23% of the time by chance — it is not evidence of an edge.",
  },
  PROMISING_SIGNAL: {
    label: "PROMISING SIGNAL",
    tone: "border-brand/40 bg-brand/[0.08] text-[#b9c2ff]",
    body: "At least one target beats the base rate after multiple-comparison correction, with ROC-AUC reliably above chance. It has not yet replicated across the test period — re-validate on newer, untouched data.",
  },
  STRONGER_SIGNAL: {
    label: "STRONGER SIGNAL",
    tone: "border-good/40 bg-good/[0.08] text-good-ink",
    body: "Two or more targets pass the corrected test on ≥1,000 test rounds with positive skill in both halves of the test period. Still uncertain: no result here guarantees future outcomes or profit.",
  },
  INSUFFICIENT_DATA: {
    label: "INSUFFICIENT DATA",
    tone: "border-warn/40 bg-warn/[0.08] text-warn",
    body: "The untouched test window is too small to judge. Import more historical rounds and retrain.",
  },
};

function Figure({ label, value, sub, strong }: { label: string; value: React.ReactNode; sub?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-5", strong ? "border-line-strong bg-white/[0.04]" : "border-line bg-white/[0.015]")}>
      <p className="text-[11px] font-medium tracking-[0.12em] text-ink-3 uppercase">{label}</p>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-ink tabular">{value}</p>
      {sub && <p className="mt-2 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

/** The headline answer to "does the model work?", recomputed from stored test rows. */
export function ModelPerformance({
  evaluation,
  modelVersion,
  testWindowRuns,
  showLink = true,
}: {
  evaluation: BacktestEvaluation;
  modelVersion: string;
  testWindowRuns: number;
  showLink?: boolean;
}) {
  const p = evaluation.perThreshold["2x"]!;
  const signal = SIGNAL_COPY[evaluation.signal];
  const notDemonstrated = evaluation.signal !== "PROMISING_SIGNAL" && evaluation.signal !== "STRONGER_SIGNAL";
  const improvement = p.accuracy_improvement * 100;

  return (
    <Card className="overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand/[0.08] to-transparent" aria-hidden />
      <CardBody className="space-y-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-brand uppercase">
              <Gauge className="size-3.5" aria-hidden /> Model performance
            </p>
            <p className="mt-2 text-sm text-ink-2">
              Out-of-sample, walk-forward · target ≥2x · <span className="font-mono text-xs">{modelVersion}</span>
            </p>
          </div>
          <div className={cn("rounded-full border px-4 py-1.5 text-xs font-bold tracking-[0.16em]", signal.tone)} role="status">
            {signal.label}
          </div>
        </div>

        {notDemonstrated && (
          <div className="flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad/[0.06] p-5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad-ink" aria-hidden />
            <div>
              <p className="text-base font-semibold text-ink md:text-lg">{NOT_DEMONSTRATED}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{signal.body}</p>
            </div>
          </div>
        )}
        {!notDemonstrated && <p className="text-sm leading-relaxed text-ink-2">{signal.body}</p>}

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Figure strong label="Test samples" value={int(p.n)} sub="unseen future rounds" />
          <Figure strong label="Baseline accuracy" value={pct(p.baseline_accuracy)} sub="majority class" />
          <Figure strong label="Model accuracy" value={pct(p.accuracy)} sub={`95% CI ${pct(p.accuracy_ci[0])}–${pct(p.accuracy_ci[1])}`} />
          <Figure
            strong
            label="Improvement"
            value={`${improvement >= 0 ? "+" : "−"}${Math.abs(improvement).toFixed(1)}`}
            sub="percentage points"
          />
          <Figure strong label="ROC-AUC" value={num(p.roc_auc, 3)} sub={p.roc_auc_ci ? `CI ${num(p.roc_auc_ci[0], 3)}–${num(p.roc_auc_ci[1], 3)}` : "0.5 = chance"} />
          <Figure strong label="Brier score" value={num(p.brier, 3)} sub={`baseline ${num(p.baseline_brier, 3)}`} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
          <p>
            Classification uses all five targets (Bonferroni-corrected). Metrics are recomputed from {int(evaluation.resolved)} stored predictions.
            {testWindowRuns > 1 && (
              <span className="text-warn">
                {" "}
                This test window has been evaluated {testWindowRuns}× — repeated looks at the same test data weaken its evidential value.
              </span>
            )}
          </p>
          {showLink && (
            <Link href="/backtest" className="inline-flex items-center gap-1 text-brand hover:underline">
              Full backtest <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
