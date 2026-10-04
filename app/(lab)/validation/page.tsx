import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, ClipboardCheck, XCircle } from "lucide-react";
import { ProvenanceChip } from "@/components/layout/provenance";
import { RunPoller, StartStageButton } from "@/components/lab/validation-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Section, SectionTitle } from "@/components/ui/section";
import { isAdmin } from "@/lib/auth";
import { THRESHOLDS } from "@/lib/constants";
import { dateTime, int, num, pct, pValue } from "@/lib/format";
import { getDataset } from "@/services/dataset";
import { protocolStatus } from "@/services/validation";
import type { ValidationRun } from "@/types";

export const metadata: Metadata = { title: "Validation" };

type Metrics = Record<string, Record<string, number | null | number[] | { tp: number }>>;
type Family = { targets: Record<string, { brier_p: number; brier_p_holm: number; auc_p: number; auc_p_holm: number; passed: boolean; nominal_only: boolean }> };

const CLASS_TONE: Record<string, string> = {
  NO_RELIABLE_EDGE: "border-bad/40 bg-bad/[0.08] text-bad-ink",
  WEAK_SIGNAL: "border-warn/40 bg-warn/[0.08] text-warn",
  PROMISING_SIGNAL: "border-brand/40 bg-brand/[0.08] text-[#b9c2ff]",
  STRONGER_SIGNAL: "border-good/40 bg-good/[0.08] text-good-ink",
  INSUFFICIENT_DATA: "border-warn/40 bg-warn/[0.08] text-warn",
};

function Check({ ok, pending, label, detail }: { ok: boolean; pending?: boolean; label: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : pending ? CircleDashed : XCircle;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-good-ink" : pending ? "text-ink-3" : "text-bad-ink")} aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-3">{detail}</p>
      </div>
    </li>
  );
}

function RunResult({ run, title }: { run: ValidationRun; title: string }) {
  const r = run.result as (Record<string, unknown> & { metrics: Metrics; multiple_testing: Family; confirmation_family?: Family | null; conclusion: string; chosen_models: Record<string, string> }) | null;
  const fam = r?.confirmation_family ?? r?.multiple_testing;
  return (
    <Card>
      <CardHeader
        eyebrow={`${title} · ${run.protocol_version}`}
        title={`${dateTime(run.window_start)} → ${dateTime(run.window_end)}`}
        description={`${int(run.window_rounds)} rounds in window · ${int(run.development_rounds)} earlier rounds available · fingerprint ${run.window_fingerprint}`}
        action={<Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "brand"}>{run.status}</Badge>}
      />
      <CardBody className="space-y-5">
        {run.status === "running" && <RunPoller id={run.id} />}
        {run.status === "failed" && <p className="text-sm text-bad-ink">Failed: {run.error}. No metrics were produced, so this window may be retried.</p>}
        {r && (
          <>
            <div className={cn("rounded-2xl border p-5", CLASS_TONE[String(run.classification)] ?? CLASS_TONE.NO_RELIABLE_EDGE)}>
              <p className="text-xs font-bold tracking-[0.18em]">{String(run.classification).replace(/_/g, " ")}</p>
              <p className="mt-2 text-base font-semibold text-ink md:text-lg">{r.conclusion}</p>
            </div>
            <div className="-mx-6 overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1100px] text-sm tabular">
                <caption className="sr-only">Per-target results with Holm correction</caption>
                <thead className="text-[10px] tracking-[0.1em] text-ink-3 uppercase">
                  <tr className="border-y border-line">
                    <th className="px-6 py-3 text-left font-medium">Target · model</th>
                    <th className="px-2 py-3 text-right font-medium">n</th>
                    <th className="px-2 py-3 text-right font-medium">Acc / base</th>
                    <th className="px-2 py-3 text-right font-medium">ROC-AUC [95% CI]</th>
                    <th className="px-2 py-3 text-right font-medium">Brier / base</th>
                    <th className="px-2 py-3 text-right font-medium">Prec · Rec · F1</th>
                    <th className="px-2 py-3 text-right font-medium">ECE</th>
                    <th className="px-2 py-3 text-right font-medium">Brier p → Holm</th>
                    <th className="px-2 py-3 text-right font-medium">AUC p → Holm</th>
                    <th className="px-6 py-3 text-left font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {THRESHOLDS.map((t) => {
                    const m = r.metrics[t.key] as Record<string, number | null> & { roc_auc_ci: number[] | null };
                    const f = fam?.targets[t.key];
                    return (
                      <tr key={t.key} className="border-b border-line/60">
                        <td className="px-6 py-2.5 text-ink">
                          {t.label} <span className="text-xs text-ink-3">· {r.chosen_models[t.key]}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-2">{int(m.n)}</td>
                        <td className="px-2 py-2.5 text-right text-ink-2">
                          {pct(m.accuracy)} / {pct(m.baseline_accuracy)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-2">
                          {num(m.roc_auc, 3)} {m.roc_auc_ci && <span className="text-ink-3">[{num(m.roc_auc_ci[0], 3)}, {num(m.roc_auc_ci[1], 3)}]</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-2">
                          {num(m.brier, 4)} / {num(m.baseline_brier, 4)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-2">
                          {m.precision === null ? "—" : pct(m.precision)} · {pct(m.recall)} · {num(m.f1, 3)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-ink-2">{pct(m.ece, 2)}</td>
                        <td className="px-2 py-2.5 text-right text-ink-2">{f ? `${pValue(f.brier_p)} → ${pValue(f.brier_p_holm)}` : "not in family"}</td>
                        <td className="px-2 py-2.5 text-right text-ink-2">{f ? `${pValue(f.auc_p)} → ${pValue(f.auc_p_holm)}` : "—"}</td>
                        <td className="px-6 py-2.5">
                          {f?.passed ? <Badge tone="good">passes</Badge> : f?.nominal_only ? <Badge tone="warn">nominal only</Badge> : <Badge>no edge</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default async function ValidationPage() {
  const dataset = await getDataset();
  const [s, admin] = await Promise.all([protocolStatus(dataset), isAdmin()]);
  const req = s.info?.requirements ?? { min_total_rounds: 45000, min_final_test_rounds: 6500, min_confirmation_rounds: 6500, min_training_rounds: 20000 };
  const enoughRounds = s.rounds >= req.min_total_rounds;
  const frozen = !!s.info?.frozen_and_unchanged;
  const canFinal = admin && !s.finalTest && frozen && enoughRounds && dataset !== "demo";
  const canConfirm =
    admin && s.finalTest?.status === "completed" && !s.confirmation && s.roundsAfterFinalTest >= req.min_confirmation_rounds;

  return (
    <>
      <PageHeader
        eyebrow="Real-data validation protocol"
        title="One frozen model. Two untouched windows."
        description="The pre-registered experiment that decides whether any predictive signal exists. Everything is frozen before the final test window is evaluated, each window can be evaluated exactly once, and a signal must survive a second, later window."
        actions={<ProvenanceChip dataset={dataset} className="text-xs" />}
      />

      {dataset !== "real" && (
        <Section>
          <p className="rounded-2xl border border-warn/40 bg-warn/[0.07] px-5 py-4 text-sm text-warn">
            {dataset === "demo"
              ? "The protocol does not run on DEMO DATA. Switch to REAL DATA (or TEST DATA for a dry run of the machinery)."
              : "TEST DATA dry run: results describe synthetic data and say nothing about real game observations."}
          </p>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section className="!mb-0">
          <Card className="h-full">
            <CardHeader eyebrow="Readiness" title="Requirements" />
            <ul className="divide-y divide-line">
              <Check ok={enoughRounds} label={`At least ${int(req.min_total_rounds)} rounds`} detail={`${int(s.rounds)} rounds in the selected dataset`} />
              <Check
                ok={frozen}
                label="Protocol frozen and unchanged"
                detail={s.info ? `${s.info.protocol_version} · ${s.info.protocol_sha256.slice(0, 16)}… · frozen ${dateTime(s.info.frozen.frozen_at)}` : `ML service unavailable: ${s.infoError}`}
              />
              <Check ok={!!s.finalTest && s.finalTest.status === "completed"} pending={!s.finalTest} label={`Final test window (latest ≥ ${int(req.min_final_test_rounds)} rounds) evaluated once`} detail={s.finalTest ? `status: ${s.finalTest.status}` : "not yet evaluated — untouched"} />
              <Check
                ok={!!s.confirmation && s.confirmation.status === "completed"}
                pending={!s.confirmation}
                label={`Confirmation window (≥ ${int(req.min_confirmation_rounds)} rounds collected after the final test)`}
                detail={s.finalTest ? `${int(s.roundsAfterFinalTest)} rounds available after the final test window` : "available after the final test"}
              />
            </ul>
            <CardBody className="flex flex-wrap gap-4 border-t border-line">
              <StartStageButton stage="final_test" disabled={!canFinal} label="Evaluate final test (once)" />
              <StartStageButton stage="confirmation" disabled={!canConfirm} label="Evaluate confirmation (once)" />
            </CardBody>
          </Card>
        </Section>
        <Section className="!mb-0" delay={0.06}>
          <Card className="h-full">
            <CardHeader eyebrow="Frozen protocol" title="What is fixed before testing" />
            <CardBody className="space-y-3 text-sm text-ink-2">
              <p><strong className="text-ink">Features:</strong> 31 leak-free features (lags, rolling stats, counts, volatility ratio, capped streak) — identical to v0.2.0-audited.</p>
              <p><strong className="text-ink">Models:</strong> logistic regression, random forest, gradient boosting; one chosen per target on validation only.</p>
              <p><strong className="text-ink">Targets:</strong> ≥1.5x, ≥2x, ≥3x, ≥5x, ≥10x. <strong className="text-ink">Baseline:</strong> training-window base rate.</p>
              <p><strong className="text-ink">Evaluation:</strong> online walk-forward; accuracy, ROC-AUC (95% CI), Brier, precision, recall, F1, calibration.</p>
              <p><strong className="text-ink">Multiple testing:</strong> Holm–Bonferroni over the 5 targets, separately for the Brier and AUC tests; an edge needs both adjusted p &lt; 0.05. Model choice happens on validation, so it adds no tests.</p>
            </CardBody>
          </Card>
        </Section>
      </div>

      {s.info && (
        <>
          <SectionTitle hint="Exact rules in ml/aviator_ml/protocol/protocol.py">Classification criteria</SectionTitle>
          <Section>
            <Card>
              <ul className="divide-y divide-line">
                {Object.entries(s.info.criteria).map(([k, v]) => (
                  <li key={k} className="grid gap-2 px-6 py-4 md:grid-cols-[200px_1fr]">
                    <span className={cn("h-fit w-fit rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.14em]", CLASS_TONE[k])}>{k.replace(/_/g, " ")}</span>
                    <span className="text-sm text-ink-2">{v}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </>
      )}

      <SectionTitle>Results</SectionTitle>
      {!s.finalTest ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-ink-2">
            <ClipboardCheck className="size-5 text-ink-3" /> No window has been evaluated for this dataset. Until it is, no claim about predictive ability can be made.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          <Section className="!mb-0">
            <RunResult run={s.finalTest} title="Stage 1 · final test window" />
          </Section>
          {s.confirmation && (
            <Section className="!mb-0">
              <RunResult run={s.confirmation} title="Stage 2 · confirmation window" />
            </Section>
          )}
        </div>
      )}
    </>
  );
}
