import { CheckCircle2, MinusCircle, HelpCircle } from "lucide-react";
import { PRIMARY_THRESHOLD, THRESHOLDS } from "@/lib/constants";
import type { BacktestEvaluation, ThresholdEvaluation } from "@/lib/evaluation";
import { int, num, pct, pValue, signedPct } from "@/lib/format";
import type { Verdict } from "@/types";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { VerdictBanner } from "./verdict-banner";

function Metric({ label, value, sub, emphasis }: { label: string; value: React.ReactNode; sub?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "rounded-2xl border border-line-strong bg-white/[0.04] p-5" : "rounded-2xl border border-line bg-white/[0.015] p-5"}>
      <p className="text-[11px] font-medium tracking-[0.12em] text-ink-3 uppercase">{label}</p>
      <p className="mt-2.5 text-2xl font-semibold tracking-tight text-ink tabular">{value}</p>
      {sub && <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{sub}</p>}
    </div>
  );
}

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (verdict === "edge_detected")
    return (
      <Badge tone="good">
        <CheckCircle2 className="size-3" aria-hidden /> Edge
      </Badge>
    );
  if (verdict === "no_edge")
    return (
      <Badge tone="bad">
        <MinusCircle className="size-3" aria-hidden /> No edge
      </Badge>
    );
  return (
    <Badge tone="warn">
      <HelpCircle className="size-3" aria-hidden /> Too little data
    </Badge>
  );
}

export function ValidationPanel({ evaluation, source }: { evaluation: BacktestEvaluation; source: string }) {
  const p = evaluation.perThreshold[PRIMARY_THRESHOLD] as ThresholdEvaluation;
  return (
    <Card className="overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand/[0.07] to-transparent" aria-hidden />
      <CardHeader
        eyebrow="Model validation"
        title={<span className="text-xl md:text-2xl">Does the model actually work?</span>}
        description={
          <>
            Out-of-sample results on {int(evaluation.resolved)} chronologically held-out rounds the model never trained on, compared with a
            base-rate baseline that sees exactly the same past data. Recomputed from {source}.
          </>
        }
      />
      <CardBody className="space-y-6">
        <VerdictBanner verdict={evaluation.verdict} />

        <div>
          <p className="mb-3 text-xs text-ink-3">
            Primary target: <span className="text-ink-2">will the next round reach ≥2x?</span> (decision threshold 50%)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              emphasis
              label="Model accuracy"
              value={pct(p.accuracy)}
              sub={`95% CI ${pct(p.accuracy_ci[0])} – ${pct(p.accuracy_ci[1])}`}
            />
            <Metric
              emphasis
              label="Baseline accuracy"
              value={pct(p.baseline_accuracy)}
              sub={`Always predicts the majority class (base rate ${pct(p.base_rate)})`}
            />
            <Metric
              emphasis
              label="Improvement"
              value={signedPct(p.accuracy_improvement)}
              sub={`McNemar p = ${pValue(p.mcnemar_p)}`}
            />
            <Metric emphasis label="Test sample size" value={int(p.n)} sub={`${int(p.positives)} rounds reached ≥2x`} />
            <Metric
              label="Brier score"
              value={num(p.brier, 4)}
              sub={`Baseline ${num(p.baseline_brier, 4)} · lower is better`}
            />
            <Metric
              label="Brier skill vs baseline"
              value={signedPct(p.brier_skill_score, 2).replace(" pp", "%")}
              sub={`One-sided p = ${pValue(p.brier_p_value)} (needs < ${p.alpha_adjusted.toFixed(3)})`}
            />
            <Metric
              label="ROC-AUC"
              value={num(p.roc_auc, 3)}
              sub={p.roc_auc_ci ? `95% CI ${num(p.roc_auc_ci[0], 3)} – ${num(p.roc_auc_ci[1], 3)} · 0.5 = chance` : "undefined (one class)"}
            />
            <Metric label="Calibration error (ECE)" value={pct(p.ece, 2)} sub="Avg. gap between predicted and observed rates" />
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white/[0.015] p-4 text-xs leading-relaxed text-ink-2">
          <strong className="text-ink">How to read this.</strong> Accuracy above 50% is <em>not</em> success: when one outcome is more common,
          a model that always guesses it scores well. The test that matters is whether the model&apos;s probabilities beat the base rate on
          unseen rounds (Brier score, paired z-test, Bonferroni-adjusted across {THRESHOLDS.length} targets) <em>and</em> rank outcomes better
          than chance (ROC-AUC interval above 0.5). Both are required to claim an edge.
        </div>

        <div className="-mx-6 overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Per-target out-of-sample results</caption>
            <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
              <tr className="border-y border-line">
                <th className="px-6 py-3 font-medium">Target</th>
                <th className="px-3 py-3 font-medium">Base rate</th>
                <th className="px-3 py-3 font-medium">Accuracy</th>
                <th className="px-3 py-3 font-medium">Baseline</th>
                <th className="px-3 py-3 font-medium">ROC-AUC [95% CI]</th>
                <th className="px-3 py-3 font-medium">Brier / baseline</th>
                <th className="px-3 py-3 font-medium">Skill</th>
                <th className="px-3 py-3 font-medium">p-value</th>
                <th className="px-6 py-3 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {THRESHOLDS.map((t) => {
                const r = evaluation.perThreshold[t.key]!;
                return (
                  <tr key={t.key} className="border-b border-line/60 transition hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-medium text-ink">{t.label}</td>
                    <td className="px-3 py-3 text-ink-2">{pct(r.base_rate)}</td>
                    <td className="px-3 py-3 text-ink">{pct(r.accuracy)}</td>
                    <td className="px-3 py-3 text-ink-2">{pct(r.baseline_accuracy)}</td>
                    <td className="px-3 py-3 text-ink-2">
                      {num(r.roc_auc, 3)}
                      {r.roc_auc_ci && <span className="text-ink-3"> [{num(r.roc_auc_ci[0], 2)}, {num(r.roc_auc_ci[1], 2)}]</span>}
                    </td>
                    <td className="px-3 py-3 text-ink-2">
                      {num(r.brier, 4)} <span className="text-ink-3">/ {num(r.baseline_brier, 4)}</span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{(r.brier_skill_score * 100).toFixed(2)}%</td>
                    <td className="px-3 py-3 text-ink-2">{pValue(r.brier_p_value)}</td>
                    <td className="px-6 py-3">
                      <VerdictChip verdict={r.verdict} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
