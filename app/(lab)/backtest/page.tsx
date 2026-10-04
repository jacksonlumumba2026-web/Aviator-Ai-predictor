import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { CalibrationChart } from "@/components/charts/calibration-chart";
import { ConfusionMatrix } from "@/components/charts/confusion-matrix";
import { SplitTimeline } from "@/components/lab/split-timeline";
import { BaselineComparison } from "@/components/lab/baseline-comparison";
import { ModelPerformance } from "@/components/lab/model-performance";
import { ValidationPanel, VerdictChip } from "@/components/lab/validation-panel";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionTitle } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { THRESHOLDS } from "@/lib/constants";
import { evaluatePredictions } from "@/lib/evaluation";
import { int, num, pct, signedPct } from "@/lib/format";
import { getDataset } from "@/services/dataset";
import { getRepository } from "@/services/repository";
import { loadBacktest } from "@/services/views";
import type { ThresholdKey } from "@/types";

export const metadata: Metadata = { title: "Backtest" };

export default async function BacktestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const target = (THRESHOLDS.find((t) => t.key === sp.target)?.key ?? "2x") as ThresholdKey;
  const dataset = await getDataset();
  const [{ run, rows, evaluation, testWindowRuns }, liveRows] = await Promise.all([
    loadBacktest(dataset),
    getRepository().allPredictions({ dataset, kind: "live" }),
  ]);

  if (!run || !evaluation) {
    return (
      <>
        <PageHeader eyebrow="Backtest" title="Chronological backtesting." description="Simulates predictions round by round using only data available at the time." />
        <Card>
          <EmptyState icon={<FlaskConical />} title="No backtest yet" description="Train a model to run a walk-forward backtest on held-out future rounds." href="/models" cta="Train a model" />
        </Card>
      </>
    );
  }

  const p = evaluation.perThreshold["2x"]!;
  const sel = evaluation.perThreshold[target]!;
  const liveEval = evaluatePredictions(liveRows);

  return (
    <>
      <PageHeader
        eyebrow={`Backtest · ${run.model_version}`}
        title="Out-of-sample, round by round."
        description="For every test round the model saw only earlier rounds, produced a probability, and was then scored against the revealed multiplier. Every number below is recomputed from those stored prediction rows."
      />

      <Section>
        <ModelPerformance evaluation={evaluation} modelVersion={run.model_version} testWindowRuns={testWindowRuns} showLink={false} dataset={dataset} />
      </Section>

      <RevealGroup className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Predictions", int(evaluation.total), "stored test rows"],
          ["Accuracy ≥2x", pct(p.accuracy), "decision at 50%"],
          ["Baseline", pct(p.baseline_accuracy), "majority class"],
          ["Improvement", signedPct(p.accuracy_improvement), "model − baseline"],
          ["ROC-AUC", num(p.roc_auc, 3), "0.5 = chance"],
          ["Brier score", num(p.brier, 4), `baseline ${num(p.baseline_brier, 4)}`],
        ].map(([l, v, s]) => (
          <RevealItem key={l}>
            <Stat label={l} value={v} sub={s} className="h-full" />
          </RevealItem>
        ))}
      </RevealGroup>

      <SectionTitle>Validation</SectionTitle>
      <Section>
        <ValidationPanel evaluation={evaluation} source={`${int(rows.length)} stored backtest predictions`} />
      </Section>

      <SectionTitle hint="Green = better than baseline, red = worse; differences alone are not evidence">Model vs baseline, every target</SectionTitle>
      <Section>
        <BaselineComparison evaluation={evaluation} />
      </Section>

      <SectionTitle hint="Choose a target">Calibration &amp; errors</SectionTitle>
      <Section>
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Target threshold">
          {THRESHOLDS.map((t) => (
            <Link
              key={t.key}
              role="tab"
              aria-selected={t.key === target}
              href={`/backtest?target=${t.key}`}
              scroll={false}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition",
                t.key === target ? "border-brand/50 bg-brand/15 text-ink" : "border-line text-ink-3 hover:text-ink-2",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              eyebrow="Reliability diagram"
              title={`Calibration for ${THRESHOLDS.find((t) => t.key === target)!.label}`}
              description={`Points on the dashed line mean predicted probabilities matched observed frequencies. Bubble size = rounds in bin. ECE ${pct(sel.ece, 2)}.`}
              action={<VerdictChip verdict={sel.verdict} />}
            />
            <CardBody>
              <CalibrationChart bins={sel.calibration} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader
              eyebrow="Confusion matrix"
              title="Calls at the 50% threshold"
              description={`Precision ${pct(sel.precision)} · recall ${pct(sel.recall)} · F1 ${num(sel.f1, 3)}`}
            />
            <CardBody>
              <ConfusionMatrix cm={sel.confusion_matrix} positiveLabel={THRESHOLDS.find((t) => t.key === target)!.label} />
              {sel.positive_predictions === 0 && (
                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  The model never assigned ≥50% to this outcome — consistent with its base rate of {pct(sel.base_rate)}. Judge it by Brier score and
                  calibration rather than accuracy.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </Section>

      <SectionTitle>Methodology</SectionTitle>
      <Section>
        <Card>
          <CardBody>
            <SplitTimeline splits={run.report.splits} />
          </CardBody>
        </Card>
      </Section>

      <SectionTitle hint="Estimates made before the outcome existed">Live track record</SectionTitle>
      <Section>
        <Card>
          <CardBody>
            {liveEval.resolved === 0 ? (
              <p className="text-sm text-ink-2">No resolved live estimates yet. They are scored automatically as new rounds arrive.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-4">
                <Stat label="Resolved" value={int(liveEval.resolved)} sub={`${int(liveEval.total - liveEval.resolved)} pending`} />
                <Stat label="Accuracy ≥2x" value={pct(liveEval.perThreshold["2x"]!.accuracy)} sub={`baseline ${pct(liveEval.perThreshold["2x"]!.baseline_accuracy)}`} />
                <Stat label="Brier ≥2x" value={num(liveEval.perThreshold["2x"]!.brier, 4)} sub={`baseline ${num(liveEval.perThreshold["2x"]!.baseline_brier, 4)}`} />
                <Stat label="Verdict" value={<VerdictChip verdict={liveEval.verdict} />} sub="same tests as backtest" />
              </div>
            )}
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
