import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ESTIMATE_LABEL, THRESHOLDS } from "@/lib/constants";
import { probabilityOf } from "@/lib/evaluation";
import { dateTime, mult, pct } from "@/lib/format";
import { auditPrediction } from "@/services/audit";

export const metadata: Metadata = { title: "Prediction audit" };

export default async function PredictionAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prediction: p, checks } = await auditPrediction(id);
  const failed = checks.filter((c) => c.status === "fail").length;
  const passed = checks.filter((c) => c.status === "pass").length;

  return (
    <>
      <Link href={`/predictions?kind=${p.kind}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Predictions
      </Link>
      <PageHeader
        eyebrow={`Audit · ${p.kind}`}
        title="Prediction audit trail."
        description={`Everything this estimate was based on, re-derived independently from the stored database rows. ${ESTIMATE_LABEL}`}
        actions={failed ? <Badge tone="bad">{failed} check(s) failed</Badge> : <Badge tone="good">{passed} checks passed</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Section className="lg:col-span-2 !mb-0">
          <Card className="h-full">
            <CardHeader eyebrow="Record" title="What was stored" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ["Prediction time", dateTime(p.prediction_time)],
                  ["Model version", <span key="v" className="font-mono text-xs">{p.model_version}</span>],
                  ["Input history ends", dateTime(p.based_on_round_time)],
                  ["Model trained through", dateTime(p.train_end_round_time)],
                  ["Target round", dateTime(p.target_round_time)],
                  ["Confidence", p.confidence],
                  ["Predicted class", p.predicted_class],
                  ["Actual multiplier", mult(p.actual_multiplier)],
                  ["≥2x call", p.result],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4 border-b border-line/60 pb-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right text-ink tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              <table className="mt-6 w-full text-sm tabular">
                <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
                  <tr>
                    <th className="py-2 text-left font-medium">Target</th>
                    <th className="py-2 text-right font-medium">Model</th>
                    <th className="py-2 text-right font-medium">Baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {THRESHOLDS.map((t) => (
                    <tr key={t.key} className="border-t border-line/60">
                      <td className="py-2 text-ink-2">{t.label}</td>
                      <td className="py-2 text-right text-ink">{pct(probabilityOf(p, t.key))}</td>
                      <td className="py-2 text-right text-ink-3">{pct(p.baseline?.[t.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </Section>
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Section className="!mb-0" delay={0.06}>
            <Card>
              <CardHeader eyebrow="Verification" title="Independent checks" description="Recomputed now from the database and the ML service." />
              <CardBody>
                <ul className="space-y-3">
                  {checks.map((c) => {
                    const Icon = c.status === "pass" ? CheckCircle2 : c.status === "fail" ? XCircle : MinusCircle;
                    const color = c.status === "pass" ? "text-good-ink" : c.status === "fail" ? "text-bad-ink" : "text-ink-3";
                    return (
                      <li key={c.name} className="flex gap-3 rounded-xl border border-line bg-white/[0.015] p-3">
                        <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-label={c.status} />
                        <div>
                          <p className="text-sm font-medium text-ink">{c.name}</p>
                          <p className="mt-0.5 text-xs break-all text-ink-3">{c.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          </Section>
          <Section className="!mb-0" delay={0.12}>
            <Card>
              <CardHeader eyebrow="Model inputs" title="Feature snapshot" description="Computed only from rounds that finished before the target round." />
              <CardBody>
                {p.features ? (
                  <div className="grid gap-x-6 gap-y-1.5 font-mono text-xs sm:grid-cols-2">
                    {Object.entries(p.features).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 border-b border-line/40 py-1">
                        <span className="text-ink-3">{k}</span>
                        <span className="text-ink tabular">{Number(v).toFixed(5)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">No snapshot stored (created before audit logging).</p>
                )}
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>
    </>
  );
}
