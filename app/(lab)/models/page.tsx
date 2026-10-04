import type { Metadata } from "next";
import { Boxes, Cpu, ServerCrash } from "lucide-react";
import { ActionButton } from "@/components/lab/action-button";
import { ConfidenceBadge } from "@/components/lab/confidence-badge";
import { VerdictChip } from "@/components/lab/validation-panel";
import { VerdictBanner } from "@/components/lab/verdict-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionTitle } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { isAdmin } from "@/lib/auth";
import { THRESHOLDS } from "@/lib/constants";
import { mlConfigured } from "@/lib/env";
import { dateTime, int, modelLabel, num, pct } from "@/lib/format";
import { getDataset } from "@/services/dataset";
import { mlHealth } from "@/services/ml-client";
import { getRepository } from "@/services/repository";
import { MIN_TRAINING_ROUNDS } from "@/services/training";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage() {
  const dataset = await getDataset();
  const repo = getRepository();
  const [runs, count, admin, health] = await Promise.all([
    repo.listModelRuns(dataset, 20),
    repo.countRounds(dataset),
    isAdmin(),
    mlConfigured() ? mlHealth().then((h) => ({ ok: true as const, ...h })).catch((e: Error) => ({ ok: false as const, error: e.message })) : null,
  ]);
  const current = runs[0];
  const canTrain = admin && count >= MIN_TRAINING_ROUNDS && health?.ok;

  return (
    <>
      <PageHeader
        eyebrow="Models"
        title="Simple baselines first."
        description="Logistic regression, random forest and gradient boosting compete on a chronological validation window for each target. Sequence models are deliberately excluded until a baseline shows real out-of-sample value."
        actions={
          admin && (
            <ActionButton url="/api/models/train" variant="primary" pendingLabel="Training & backtesting…">
              <Cpu className="size-4" /> Train &amp; backtest
            </ActionButton>
          )
        }
      />

      <Section>
        {!health ? (
          <div className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/[0.07] px-5 py-4 text-sm text-warn">
            <ServerCrash className="size-4" /> ML service not configured — set <code className="font-mono">ML_SERVICE_URL</code>. See README → ML service.
          </div>
        ) : health.ok ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3">
            <Badge tone="good">ML service online</Badge>
            <span>v{health.service_version}</span>
            <span>· auth {health.auth_enabled ? "enabled" : "disabled"}</span>
            <span>· {count.toLocaleString("en-US")} rounds available (min {MIN_TRAINING_ROUNDS})</span>
            {!canTrain && admin && count < MIN_TRAINING_ROUNDS && <span className="text-warn">· not enough rounds to train</span>}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-bad/40 bg-bad/[0.07] px-5 py-4 text-sm text-bad-ink">
            <ServerCrash className="size-4" /> {health.error}
          </div>
        )}
      </Section>

      {!current ? (
        <Card>
          <EmptyState
            icon={<Boxes />}
            title="No model trained for this dataset"
            description={`Training needs at least ${MIN_TRAINING_ROUNDS} rounds: the first 20 provide feature history, then 70% train · 15% validation · 15% test, strictly in time order.`}
          />
        </Card>
      ) : (
        <>
          <Section>
            <Card>
              <CardHeader
                eyebrow="Current model"
                title={<span className="font-mono text-base">{current.model_version}</span>}
                description={`Trained ${dateTime(current.created_at)} on the ${current.dataset.toUpperCase()} dataset`}
                action={<ConfidenceBadge level={current.confidence} />}
              />
              <CardBody className="space-y-6">
                <VerdictBanner verdict={current.verdict} compact />
                <RevealGroup className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    ["Training", int(current.training_samples), "rounds"],
                    ["Validation", int(current.validation_samples), "rounds"],
                    ["Test", int(current.test_samples), "future rounds"],
                    ["Accuracy ≥2x", pct(current.accuracy), `baseline ${pct(current.baseline_accuracy)}`],
                    ["ROC-AUC ≥2x", num(current.roc_auc, 3), "0.5 = chance"],
                    ["Brier ≥2x", num(current.brier_score, 4), "lower is better"],
                  ].map(([l, v, s]) => (
                    <RevealItem key={l}>
                      <Stat label={l} value={v} sub={s} className="h-full p-4 [&>div:nth-child(2)]:text-2xl" />
                    </RevealItem>
                  ))}
                </RevealGroup>
              </CardBody>
            </Card>
          </Section>

          <SectionTitle hint="Validation Brier score — lower is better">Model selection</SectionTitle>
          <Section>
            <Card>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] text-sm tabular">
                  <caption className="sr-only">Validation scores per candidate model and target</caption>
                  <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                    <tr className="border-b border-line">
                      <th className="px-6 py-3.5 text-left font-medium">Target</th>
                      {Object.keys(current.report.selection["2x"]?.validation_scores ?? {}).map((m) => (
                        <th key={m} className="px-3 py-3.5 text-right font-medium">
                          {modelLabel(m)}
                        </th>
                      ))}
                      <th className="px-6 py-3.5 text-left font-medium">Selected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {THRESHOLDS.map((t) => {
                      const s = current.report.selection[t.key];
                      if (!s) return null;
                      return (
                        <tr key={t.key} className="border-b border-line/60">
                          <td className="px-6 py-3 font-medium text-ink">{t.label}</td>
                          {Object.entries(s.validation_scores).map(([m, sc]) => (
                            <td key={m} className={cn("px-3 py-3 text-right", m === s.selected_model ? "font-semibold text-ink" : "text-ink-3")}>
                              {num(sc.brier, 4)}
                            </td>
                          ))}
                          <td className="px-6 py-3">
                            <span className="text-ink-2">{modelLabel(s.selected_model)}</span>{" "}
                            {s.beats_base_rate_on_validation ? <Badge tone="brand">beats base rate on val.</Badge> : <Badge>≤ base rate on val.</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          <SectionTitle hint="All computed from rounds strictly before the predicted round">Features</SectionTitle>
          <Section>
            <Card>
              <CardBody className="flex flex-wrap gap-2">
                {current.report.feature_names.map((f) => (
                  <span key={f} className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-ink-2">
                    {f}
                  </span>
                ))}
              </CardBody>
            </Card>
          </Section>

          <SectionTitle>Run history</SectionTitle>
          <Section>
            <Card>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] text-sm tabular">
                  <caption className="sr-only">Previous model runs</caption>
                  <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                    <tr className="border-b border-line">
                      <th className="px-6 py-3.5 text-left font-medium">Version</th>
                      <th className="px-3 py-3.5 text-left font-medium">Trained</th>
                      <th className="px-3 py-3.5 text-right font-medium">Train</th>
                      <th className="px-3 py-3.5 text-right font-medium">Test</th>
                      <th className="px-3 py-3.5 text-right font-medium">Acc. / baseline</th>
                      <th className="px-3 py-3.5 text-right font-medium">AUC</th>
                      <th className="px-6 py-3.5 text-left font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="px-6 py-3 font-mono text-xs text-ink-2">{r.model_version}</td>
                        <td className="px-3 py-3 text-ink-3">{dateTime(r.created_at)}</td>
                        <td className="px-3 py-3 text-right text-ink-2">{int(r.training_samples)}</td>
                        <td className="px-3 py-3 text-right text-ink-2">{int(r.test_samples)}</td>
                        <td className="px-3 py-3 text-right text-ink-2">
                          {pct(r.accuracy)} <span className="text-ink-3">/ {pct(r.baseline_accuracy)}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-ink-2">{num(r.roc_auc, 3)}</td>
                        <td className="px-6 py-3">
                          <VerdictChip verdict={r.verdict} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
