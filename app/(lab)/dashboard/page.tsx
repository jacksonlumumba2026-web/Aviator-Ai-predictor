import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Boxes, Database, Hash, Layers, Sigma, TrendingUp } from "lucide-react";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { ProbabilityBars } from "@/components/charts/probability-bars";
import { RollingChart } from "@/components/charts/rolling-chart";
import { SequenceStrip } from "@/components/charts/sequence-strip";
import { EstimateCard } from "@/components/lab/estimate-card";
import { VerdictBanner } from "@/components/lab/verdict-banner";
import { ConfidenceBadge } from "@/components/lab/confidence-badge";
import { ActionButton } from "@/components/lab/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionTitle } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { isAdmin } from "@/lib/auth";
import { THRESHOLDS } from "@/lib/constants";
import { dateTime, int, mult, num, pct, relativeTime } from "@/lib/format";
import { getDataset } from "@/services/dataset";
import { loadBacktest, loadOverview } from "@/services/views";
import { ModelPerformance } from "@/components/lab/model-performance";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const dataset = await getDataset();
  const [{ rounds, stats, rolling50, latestRun, latestEstimate }, admin, bt] = await Promise.all([loadOverview(dataset), isAdmin(), loadBacktest(dataset)]);
  const latest = rounds[rounds.length - 1];

  if (!rounds.length) {
    return (
      <>
        <PageHeader
          eyebrow="Overview"
          title="Test whether the numbers hold any signal."
          description="Import historical multipliers, inspect their statistics, then let a chronologically backtested model tell you — honestly — whether it beats a simple base rate."
        />
        <Card>
          <EmptyState
            icon={<Database />}
            title={dataset === "demo" ? "No demo data loaded" : "No real rounds stored yet"}
            description={
              dataset === "demo"
                ? "Load the synthetic demo dataset from the Data page to explore the lab. It is clearly labelled and never mixed with real data."
                : "Upload a CSV of legitimately obtained historical results or enter rounds manually. You can also explore with the synthetic demo dataset."
            }
            href="/data"
            cta="Open the Data page"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={dataset === "demo" ? "Overview · demo dataset" : "Overview"}
        title={
          <>
            {int(stats.count)} rounds analysed.
            <span className="block text-ink-3">Here&apos;s what the data says.</span>
          </>
        }
        description="Descriptive statistics of stored history and the latest model output. Statistics describe the past; they are not forecasts."
        actions={
          <>
            <Link href="/backtest" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-[#8a99ff] to-[#6274f5] px-4 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgb(123_140_255/0.6)] transition hover:brightness-110">
              Does the model work? <ArrowUpRight className="size-4" />
            </Link>
            <Link href="/data" className="inline-flex h-10 items-center rounded-xl border border-line-strong bg-white/[0.04] px-4 text-sm font-medium text-ink transition hover:bg-white/[0.08]">
              Manage data
            </Link>
          </>
        }
      />

      <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevealItem>
          <Stat label="Latest multiplier" value={mult(latest.multiplier)} sub={`${relativeTime(latest.round_time)} · ${latest.source}`} icon={<TrendingUp />} />
        </RevealItem>
        <RevealItem>
          <Stat label="Stored rounds" value={int(stats.count)} sub={`Since ${dateTime(rounds[0].round_time).slice(0, 10)}`} icon={<Hash />} />
        </RevealItem>
        <RevealItem>
          <Stat label="Median" value={mult(stats.median)} sub={`Mean ${mult(stats.mean)} · σ ${num(stats.std)}`} icon={<Sigma />} />
        </RevealItem>
        <RevealItem>
          <Stat label="Reached ≥2x" value={pct(stats.reaching["2x"].rate)} sub={`95% CI ${pct(stats.reaching["2x"].lower)}–${pct(stats.reaching["2x"].upper)}`} icon={<Layers />} />
        </RevealItem>
      </RevealGroup>

      {bt.run && bt.evaluation && (
        <Section className="mt-6 md:mt-8">
          <ModelPerformance evaluation={bt.evaluation} modelVersion={bt.run.model_version} testWindowRuns={bt.testWindowRuns} />
        </Section>
      )}

      <SectionTitle hint="Share of all stored rounds per multiplier range">Distribution</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-5">
        <Section className="lg:col-span-3 !mb-0">
          <Card className="h-full">
            <CardHeader eyebrow="Histogram" title="Where multipliers land" description={`Min ${mult(stats.min)} · max ${mult(stats.max)}`} />
            <CardBody>
              <DistributionChart bins={stats.histogram} />
            </CardBody>
          </Card>
        </Section>
        <Section className="lg:col-span-2 !mb-0" delay={0.08}>
          <Card className="h-full">
            <CardHeader eyebrow="Empirical frequencies" title="How often each level was reached" description="Observed share of stored rounds with 95% Wilson intervals." />
            <CardBody>
              <ProbabilityBars
                valueLabel="Observed share"
                rows={THRESHOLDS.map((t) => {
                  const r = stats.reaching[t.key];
                  return { label: t.label, value: r.rate, ci: [r.lower, r.upper] as [number, number] };
                })}
              />
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
                {(["1.2x", "1.5x", "2x"] as const).map((k) => (
                  <div key={k}>
                    <p className="text-lg font-semibold text-ink tabular">{pct(stats.below[k].rate)}</p>
                    <p className="text-[11px] text-ink-3">below {k}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </Section>
      </div>

      <SectionTitle hint="50-round windows">Rolling behaviour</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section className="!mb-0">
          <Card>
            <CardHeader eyebrow="Rolling median" title="Typical multiplier over time" />
            <CardBody>
              <RollingChart points={rolling50} metric="median" window={50} />
            </CardBody>
          </Card>
        </Section>
        <Section className="!mb-0" delay={0.08}>
          <Card>
            <CardHeader eyebrow="Rolling volatility" title="Dispersion of log multipliers" />
            <CardBody>
              <RollingChart points={rolling50} metric="volatility" window={50} color="#199e70" />
            </CardBody>
          </Card>
        </Section>
      </div>

      <SectionTitle>Model</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-5">
        <Section className="lg:col-span-2 !mb-0">
          <EstimateCard prediction={latestEstimate} canPredict={admin && !!latestRun} />
        </Section>
        <Section className="lg:col-span-3 !mb-0" delay={0.08}>
          <Card className="h-full">
            <CardHeader
              eyebrow="Model status"
              title={latestRun ? <span className="font-mono text-sm">{latestRun.model_version}</span> : "No model trained"}
              action={latestRun ? <ConfidenceBadge level={latestRun.confidence} /> : <Badge>Untrained</Badge>}
            />
            <CardBody className="space-y-5">
              {latestRun ? (
                <>
                  <VerdictBanner verdict={latestRun.verdict} compact />
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      ["Trained", relativeTime(latestRun.created_at)],
                      ["Train rows", int(latestRun.training_samples)],
                      ["Test rows", int(latestRun.test_samples)],
                      ["ROC-AUC ≥2x", num(latestRun.roc_auc, 3)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-line bg-white/[0.015] p-3">
                        <dt className="text-[11px] text-ink-3">{k}</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink tabular">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link href="/models" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                    Model details <ArrowUpRight className="size-3.5" />
                  </Link>
                </>
              ) : (
                <EmptyState
                  icon={<Boxes />}
                  title="Train a baseline model"
                  description="Logistic regression, random forest and gradient boosting are compared on a chronological validation split, then tested walk-forward on future rounds."
                >
                  {admin && stats.count >= 320 && (
                    <div className="mt-6">
                      <ActionButton url="/api/models/train" variant="primary" pendingLabel="Training & backtesting…">
                        Train &amp; backtest
                      </ActionButton>
                    </div>
                  )}
                </EmptyState>
              )}
            </CardBody>
          </Card>
        </Section>
      </div>

      <SectionTitle hint="Oldest → newest">Recent rounds</SectionTitle>
      <Section>
        <Card>
          <CardBody>
            <SequenceStrip values={rounds.slice(-60)} />
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
