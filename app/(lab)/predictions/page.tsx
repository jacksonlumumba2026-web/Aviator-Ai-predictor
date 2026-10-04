import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock, ListOrdered, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ESTIMATE_LABEL, THRESHOLDS } from "@/lib/constants";
import { probabilityOf } from "@/lib/evaluation";
import { dateTime, int, mult } from "@/lib/format";
import { getDataset } from "@/services/dataset";
import { getRepository } from "@/services/repository";

export const metadata: Metadata = { title: "Predictions" };

const PAGE_SIZE = 50;

function ResultCell({ result }: { result: "pending" | "correct" | "incorrect" }) {
  if (result === "pending")
    return (
      <Badge>
        <Clock className="size-3" aria-hidden /> Pending
      </Badge>
    );
  return result === "correct" ? (
    <Badge tone="good">
      <Check className="size-3" aria-hidden /> Correct
    </Badge>
  ) : (
    <Badge tone="bad">
      <X className="size-3" aria-hidden /> Incorrect
    </Badge>
  );
}

export default async function PredictionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const kind = sp.kind === "backtest" ? "backtest" : "live";
  const page = Math.max(1, Number(sp.page) || 1);
  const dataset = await getDataset();
  const { rows, total } = await getRepository().listPredictions({ dataset, kind }, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (k: string, p = 1) => `/predictions?kind=${k}&page=${p}`;

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title="Every estimate, on the record."
        description={
          <>
            Each row is a probability estimate produced by a trained model before the outcome was known, stored and later compared with the
            actual result. <span className="text-ink-3">{ESTIMATE_LABEL}</span>
          </>
        }
      />

      <Section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-xl border border-line bg-white/[0.02] p-1" role="tablist">
            {(["live", "backtest"] as const).map((k) => (
              <Link
                key={k}
                href={href(k)}
                role="tab"
                aria-selected={kind === k}
                className={cn("rounded-lg px-4 py-1.5 text-sm transition", kind === k ? "bg-white/[0.08] text-ink" : "text-ink-3 hover:text-ink-2")}
              >
                {k === "live" ? "Live estimates" : "Backtest (walk-forward)"}
              </Link>
            ))}
          </div>
          <p className="text-xs text-ink-3">
            {int(total)} rows · “Correct/Incorrect” scores the ≥2x call (predicts ≥2x when its probability ≥ 50%)
          </p>
        </div>

        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={<ListOrdered />}
              title={kind === "live" ? "No live estimates yet" : "No backtest predictions yet"}
              description={
                kind === "live"
                  ? "Live estimates are created after a model is trained and whenever new real rounds arrive."
                  : "Training a model stores one out-of-sample prediction for every held-out test round."
              }
              href="/models"
              cta="Go to Models"
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[980px] text-sm tabular">
                <caption className="sr-only">{kind} predictions</caption>
                <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                  <tr className="border-b border-line">
                    <th className="px-6 py-3.5 text-left font-medium">Time</th>
                    <th className="px-3 py-3.5 text-left font-medium">Model</th>
                    {THRESHOLDS.map((t) => (
                      <th key={t.key} className="px-3 py-3.5 text-right font-medium">
                        {t.label}
                      </th>
                    ))}
                    <th className="px-3 py-3.5 text-left font-medium">Confidence</th>
                    <th className="px-3 py-3.5 text-right font-medium">Actual</th>
                    <th className="px-6 py-3.5 text-left font-medium">≥2x call</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 transition hover:bg-white/[0.02]">
                      <td className="px-6 py-3 whitespace-nowrap text-ink-2">{dateTime(p.prediction_time)}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-ink-3">{p.model_version}</td>
                      {THRESHOLDS.map((t) => {
                        const v = probabilityOf(p, t.key);
                        return (
                          <td key={t.key} className={cn("px-3 py-3 text-right", v >= 0.5 ? "text-ink" : "text-ink-2")}>
                            {(v * 100).toFixed(1)}%
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-xs text-ink-2">{p.confidence}</td>
                      <td className="px-3 py-3 text-right font-medium text-ink">{mult(p.actual_multiplier)}</td>
                      <td className="px-6 py-3">
                        <ResultCell result={p.result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <CardBody className="flex items-center justify-between border-t border-line py-4 text-sm">
              <span className="text-ink-3">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Link
                  aria-disabled={page <= 1}
                  href={href(kind, page - 1)}
                  className={cn("rounded-lg border border-line-strong px-3 py-1.5 text-ink-2 hover:text-ink", page <= 1 && "pointer-events-none opacity-40")}
                >
                  Previous
                </Link>
                <Link
                  aria-disabled={page >= pages}
                  href={href(kind, page + 1)}
                  className={cn("rounded-lg border border-line-strong px-3 py-1.5 text-ink-2 hover:text-ink", page >= pages && "pointer-events-none opacity-40")}
                >
                  Next
                </Link>
              </div>
            </CardBody>
          )}
        </Card>
      </Section>
    </>
  );
}
