import type { Metadata } from "next";
import { PlugZap, Radio, WifiOff } from "lucide-react";
import { SequenceStrip } from "@/components/charts/sequence-strip";
import { EstimateCard } from "@/components/lab/estimate-card";
import { LiveRefresher } from "@/components/lab/live-refresher";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section, SectionTitle } from "@/components/ui/section";
import { isAdmin } from "@/lib/auth";
import { LIVE_NOT_CONNECTED } from "@/lib/constants";
import { dateTime, mult, num, pct, relativeTime } from "@/lib/format";
import { mean, median, std } from "@/lib/stats";
import { getDataset } from "@/services/dataset";
import { getLiveStatus } from "@/services/live";
import { getRepository } from "@/services/repository";

export const metadata: Metadata = { title: "Live Analysis" };

const WINDOWS = [10, 20, 50, 100] as const;

export default async function LivePage() {
  const dataset = await getDataset();
  const repo = getRepository();
  const [status, recent, runs, live, admin] = await Promise.all([
    getLiveStatus(),
    repo.latestRounds(dataset, 100),
    repo.listModelRuns(dataset, 1),
    repo.listPredictions({ dataset, kind: "live" }, { limit: 1, offset: 0 }),
    isAdmin(),
  ]);
  const latest = recent[recent.length - 1];
  const connected = status.connected && dataset === "real";

  return (
    <>
      <PageHeader
        eyebrow="Live analysis"
        title={connected ? "Streaming from an authorised source." : "Latest stored results."}
        description="The newest rounds, short-window statistics and the model's current probability estimates. Nothing on this page is fabricated: it reflects only what has been ingested."
        actions={<LiveRefresher isDemo={dataset === "demo"} />}
      />

      <Section>
        {connected ? (
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-good/40 bg-good/[0.07] px-5 py-4 text-sm text-good-ink">
            <Radio className="size-4 animate-pulse-soft" aria-hidden />
            Live feed connected —{" "}
            {status.sources
              .filter((s) => s.enabled)
              .map((s) => `${s.source_name} (${relativeTime(s.last_update)})`)
              .join(", ")}
          </div>
        ) : (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/[0.07] px-5 py-4 text-sm text-warn">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{LIVE_NOT_CONNECTED}</p>
              <p className="mt-1 text-xs text-ink-2">
                {dataset === "demo"
                  ? "The demo dataset is static synthetic data and is never shown as live."
                  : "Connect an authorised source via POST /api/ingest (see Settings → Data sources). Private or undocumented betting-site endpoints are not supported."}
              </p>
            </div>
          </div>
        )}
      </Section>

      {!latest ? (
        <Card>
          <EmptyState icon={<PlugZap />} title="No rounds yet" description="Once rounds are ingested they appear here immediately." href="/data" cta="Add data" />
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <Section className="lg:col-span-3 !mb-0">
              <Card className="h-full">
                <CardHeader
                  eyebrow={connected ? "Incoming result" : "Most recent stored result"}
                  title="Latest round"
                  action={<Badge>{latest.source}</Badge>}
                />
                <CardBody>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                    <p className="text-6xl font-semibold tracking-[-0.04em] text-ink tabular md:text-7xl">{mult(latest.multiplier)}</p>
                    <p className="pb-2 text-sm text-ink-3">
                      {dateTime(latest.round_time)} · {relativeTime(latest.round_time)}
                    </p>
                  </div>
                  <div className="mt-8 -mx-6 overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[520px] text-sm tabular">
                      <caption className="sr-only">Rolling statistics over recent windows</caption>
                      <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                        <tr className="border-y border-line">
                          <th className="px-6 py-2.5 text-left font-medium">Window</th>
                          <th className="px-3 py-2.5 text-right font-medium">Mean</th>
                          <th className="px-3 py-2.5 text-right font-medium">Median</th>
                          <th className="px-3 py-2.5 text-right font-medium">σ(log)</th>
                          <th className="px-6 py-2.5 text-right font-medium">≥2x share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WINDOWS.filter((w) => recent.length >= w).map((w) => {
                          const xs = recent.slice(-w).map((r) => r.multiplier);
                          return (
                            <tr key={w} className="border-b border-line/60">
                              <td className="px-6 py-2.5 text-ink-2">Last {w}</td>
                              <td className="px-3 py-2.5 text-right text-ink">{mult(mean(xs))}</td>
                              <td className="px-3 py-2.5 text-right text-ink">{mult(median(xs))}</td>
                              <td className="px-3 py-2.5 text-right text-ink">{num(std(xs.map(Math.log)), 3)}</td>
                              <td className="px-6 py-2.5 text-right text-ink">{pct(xs.filter((x) => x >= 2).length / xs.length)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-ink-3">
                    Short windows are noisy by nature. Swings in these numbers are expected even when every round is independent and are not
                    signals that a particular outcome is &ldquo;due&rdquo;.
                  </p>
                </CardBody>
              </Card>
            </Section>
            <Section className="lg:col-span-2 !mb-0" delay={0.08}>
              <EstimateCard prediction={live.rows[0] ?? null} canPredict={admin && runs.length > 0} title="Model probabilities" />
            </Section>
          </div>

          <SectionTitle hint={`${Math.min(recent.length, 100)} most recent · oldest → newest`}>Recent sequence</SectionTitle>
          <Section>
            <Card>
              <CardBody>
                <SequenceStrip values={recent} />
              </CardBody>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
