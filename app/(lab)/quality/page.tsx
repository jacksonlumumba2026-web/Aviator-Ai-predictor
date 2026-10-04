import type { Metadata } from "next";
import { CheckCircle2, Microscope, ShieldAlert, XCircle } from "lucide-react";
import { AcfChart } from "@/components/charts/acf-chart";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { ProbabilityBars } from "@/components/charts/probability-bars";
import { ProvenanceChip } from "@/components/layout/provenance";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionTitle } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { THRESHOLDS } from "@/lib/constants";
import { int, mult, num, pValue } from "@/lib/format";
import { qualityReport } from "@/lib/quality";
import { getDataset } from "@/services/dataset";
import { getRepository } from "@/services/repository";

export const metadata: Metadata = { title: "Data Quality" };

export default async function QualityPage() {
  const dataset = await getDataset();
  const repo = getRepository();
  const [rounds, batches] = await Promise.all([repo.allRounds({ dataset }), repo.listImportBatches(dataset)]);
  if (!rounds.length) {
    return (
      <>
        <PageHeader eyebrow="Data quality" title="Check the data before trusting any model." />
        <Card>
          <EmptyState icon={<Microscope />} title="No rounds in this dataset" description="Import data on the Data page to generate the quality report." href="/data" cta="Import data" />
        </Card>
      </>
    );
  }
  const q = qualityReport(rounds);
  const dup = batches.reduce((a, b) => a + b.duplicates_in_file + b.already_stored, 0);
  const rejected = batches.reduce((a, b) => a + b.rejected_rows, 0);
  const ind = q.independence;

  return (
    <>
      <PageHeader
        eyebrow="Data quality & independence"
        title="Is the data clean — and is it independent?"
        description="Completeness, duplicates, time gaps and distribution of the selected dataset, followed by distribution-free tests for sequential dependence. Independence is tested, never assumed."
        actions={<ProvenanceChip dataset={dataset} className="text-xs" />}
      />

      <RevealGroup className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total rounds", int(q.totalRounds), `${batches.length} import batch(es)`],
          ["Unique rounds", int(q.uniqueRounds), "distinct round_time"],
          ["Duplicates", int(dup), "skipped at import"],
          ["Rejected rows", int(rejected), "invalid / impossible / missing"],
          ["Time gaps", int(q.timeGaps.gapCount), `≈ ${int(q.timeGaps.estimatedMissingRounds)} missing rounds`],
          ["Median interval", q.timeGaps.medianIntervalS === null ? "—" : `${q.timeGaps.medianIntervalS.toFixed(1)} s`, "between rounds"],
        ].map(([l, v, s]) => (
          <RevealItem key={l}>
            <Stat label={l} value={v} sub={s} className="h-full" />
          </RevealItem>
        ))}
      </RevealGroup>

      <SectionTitle hint={`${q.firstRoundTime?.slice(0, 19).replace("T", " ")} → ${q.lastRoundTime?.slice(0, 19).replace("T", " ")} UTC`}>Distribution</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-5">
        <Section className="lg:col-span-3 !mb-0">
          <Card className="h-full">
            <CardHeader eyebrow="Histogram" title="Multiplier distribution" description={`min ${mult(q.stats.min)} · median ${mult(q.stats.median)} · mean ${mult(q.stats.mean)} · max ${mult(q.stats.max)} · σ ${num(q.stats.std)}`} />
            <CardBody>
              <DistributionChart bins={q.stats.histogram} />
            </CardBody>
          </Card>
        </Section>
        <Section className="lg:col-span-2 !mb-0" delay={0.06}>
          <Card className="h-full">
            <CardHeader eyebrow="Threshold frequencies" title="Share reaching each level" description="95% Wilson intervals. The mean is dominated by rare extreme rounds; prefer median and frequencies." />
            <CardBody>
              <ProbabilityBars valueLabel="Observed share" rows={THRESHOLDS.map((t) => ({ label: t.label, value: q.stats.reaching[t.key].rate, ci: [q.stats.reaching[t.key].lower, q.stats.reaching[t.key].upper] as [number, number] }))} />
            </CardBody>
          </Card>
        </Section>
      </div>

      {q.timeGaps.gaps.length > 0 && (
        <>
          <SectionTitle hint={`gaps longer than ${q.timeGaps.gapThresholdS?.toFixed(0)} s`}>Missing-data check</SectionTitle>
          <Section>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] text-sm tabular">
                  <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                    <tr className="border-b border-line">
                      <th className="px-6 py-3 text-left font-medium">After round</th>
                      <th className="px-3 py-3 text-left font-medium">Before round</th>
                      <th className="px-3 py-3 text-right font-medium">Gap</th>
                      <th className="px-6 py-3 text-right font-medium">≈ missing rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.timeGaps.gaps.slice(0, 15).map((g) => (
                      <tr key={g.after} className="border-b border-line/60">
                        <td className="px-6 py-2.5 text-ink-2">{g.after.replace("T", " ").slice(0, 19)}</td>
                        <td className="px-3 py-2.5 text-ink-2">{g.before.replace("T", " ").slice(0, 19)}</td>
                        <td className="px-3 py-2.5 text-right text-ink">{(g.seconds / 60).toFixed(1)} min</td>
                        <td className="px-6 py-2.5 text-right text-warn">{int(g.estimatedMissingRounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-6 py-4 text-xs text-ink-3">
                Models treat stored rounds as consecutive. Lag features spanning a gap mix rounds that were not adjacent; large gaps should be investigated before a final test.
              </p>
            </Card>
          </Section>
        </>
      )}

      <SectionTitle hint="Holm–Bonferroni across the whole family, α = 0.05">Independence diagnostics</SectionTitle>
      {!ind ? (
        <Card>
          <CardBody className="text-sm text-ink-2">At least 200 rounds are needed for dependence diagnostics.</CardBody>
        </Card>
      ) : (
        <>
          <Section>
            <div className="grid gap-4 lg:grid-cols-2">
              <div role="status" className={ind.dependenceDetected ? "flex gap-4 rounded-2xl border border-warn/40 bg-warn/[0.07] p-5" : "flex gap-4 rounded-2xl border border-line-strong bg-white/[0.03] p-5"}>
                {ind.dependenceDetected ? <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ink-2" />}
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] text-ink-3 uppercase">Evidence of dependence</p>
                  <p className="mt-1 text-base font-semibold text-ink">{ind.dependenceDetected ? "Detected" : "Not detected"}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{ind.summary}</p>
                </div>
              </div>
              <div className="flex gap-4 rounded-2xl border border-line-strong bg-white/[0.03] p-5">
                <XCircle className="mt-0.5 size-5 shrink-0 text-ink-3" />
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] text-ink-3 uppercase">Evidence that dependence is exploitable</p>
                  <p className="mt-1 text-base font-semibold text-ink">Not assessed here</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{ind.exploitability}</p>
                </div>
              </div>
            </div>
          </Section>

          <Section>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[900px] text-sm">
                  <caption className="sr-only">Independence tests</caption>
                  <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                    <tr className="border-b border-line">
                      <th className="px-6 py-3 text-left font-medium">Test</th>
                      <th className="px-3 py-3 text-left font-medium">Statistic</th>
                      <th className="px-3 py-3 text-left font-medium">Effect size</th>
                      <th className="px-3 py-3 text-right font-medium">p</th>
                      <th className="px-3 py-3 text-right font-medium">p (Holm)</th>
                      <th className="px-6 py-3 text-left font-medium">Independence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ind.tests.map((t) => (
                      <tr key={t.id} className="border-b border-line/60">
                        <td className="px-6 py-2.5 text-ink">{t.name}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-2 tabular">{t.statistic}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-2 tabular">{t.effect}</td>
                        <td className="px-3 py-2.5 text-right text-ink-2 tabular">{pValue(t.p)}</td>
                        <td className="px-3 py-2.5 text-right text-ink tabular">{pValue(t.pHolm)}</td>
                        <td className="px-6 py-2.5">{t.rejected ? <Badge tone="warn">rejected</Badge> : <Badge>not rejected</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section className="!mb-0">
              <Card>
                <CardHeader eyebrow="Autocorrelation (ranks)" title="Rank autocorrelation by lag" description="Distribution-free (equivalent for m and ln m). Dashed lines: ±1.96/√n expected under independence — about 1 lag in 20 crosses by chance." />
                <CardBody>
                  <AcfChart points={ind.rankAcf} band={ind.acfBand} label="rank ρ" />
                </CardBody>
              </Card>
            </Section>
            <Section className="!mb-0" delay={0.06}>
              <Card>
                <CardHeader eyebrow="Autocorrelation (indicator)" title="≥2x indicator autocorrelation by lag" description="Does reaching 2x in one round relate to reaching 2x k rounds later?" />
                <CardBody>
                  <AcfChart points={ind.indicatorAcf2x} band={ind.acfBand} label="indicator ρ" />
                </CardBody>
              </Card>
            </Section>
          </div>

          <div className="mt-6 grid gap-6 md:mt-8 lg:grid-cols-2">
            <Section className="!mb-0">
              <Card className="h-full">
                <CardHeader eyebrow="Conditional frequencies" title="P(next ≥ 2x | recent history)" description="Under independence every row matches the unconditional rate. A run of low rounds does not make a high round “due”." />
                <CardBody>
                  <ProbabilityBars
                    valueLabel="Conditional rate"
                    referenceLabel="Rate when condition is false"
                    rows={ind.conditional.map((c) => ({ label: c.condition.replace("previous", "prev."), value: c.rate.rate, ci: [c.rate.lower, c.rate.upper] as [number, number], reference: c.complementRate }))}
                  />
                  <p className="mt-4 text-xs text-ink-3">Labels: condition on the preceding rounds; n per condition ranges {int(Math.min(...ind.conditional.map((c) => c.n)))}–{int(Math.max(...ind.conditional.map((c) => c.n)))}.</p>
                </CardBody>
              </Card>
            </Section>
            <Section className="!mb-0" delay={0.06}>
              <Card className="h-full">
                <CardHeader eyebrow="Rolling stability" title="≥2x share across 10 consecutive blocks" description="A stable process should show overlapping intervals; drift suggests a changing distribution or data problems." />
                <CardBody>
                  <ProbabilityBars valueLabel="≥2x share in block" rows={ind.blocks.map((b) => ({ label: `#${b.block}`, value: b.reach2x.rate, ci: [b.reach2x.lower, b.reach2x.upper] as [number, number] }))} />
                </CardBody>
              </Card>
            </Section>
          </div>
          <Section className="mt-6">
            <p className="text-xs leading-relaxed text-ink-3">
              Methods: Ljung–Box on rank and indicator autocorrelations (lags 1–20); Wald–Wolfowitz runs tests per threshold; Pearson χ² on lag-1 tier transitions
              (5 tiers) with Cramér&apos;s V; two-proportion z-tests for conditional rates; χ² homogeneity of tiers across 10 blocks; two-sample KS (first vs second half,
              conservative with ties). No test assumes normally distributed multipliers. All {ind.tests.length} p-values are Holm–Bonferroni adjusted as one family.
            </p>
          </Section>
        </>
      )}
    </>
  );
}
