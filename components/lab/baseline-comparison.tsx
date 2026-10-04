import { THRESHOLDS } from "@/lib/constants";
import type { BacktestEvaluation } from "@/lib/evaluation";
import { num, pct } from "@/lib/format";
import { Card, CardBody, CardHeader } from "../ui/card";
import { cn } from "../ui/cn";
import { VerdictChip } from "./validation-panel";

/** neutral: threshold-dependent metrics that trade off against each other — a difference is not a "win". */
type Row = { label: string; model: number | null; base: number | null; fmt: "pct" | "num"; lowerIsBetter?: boolean; neutral?: boolean };

function delta(r: Row) {
  if (r.model === null || r.base === null) return { text: "—", tone: "text-ink-3" };
  const d = r.model - r.base;
  const better = r.lowerIsBetter ? d < 0 : d > 0;
  const text = r.fmt === "pct" ? `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)} pp` : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(4)}`;
  return { text, tone: r.neutral || Math.abs(d) < 1e-12 ? "text-ink-3" : better ? "text-good-ink" : "text-bad-ink" };
}

/** Model vs baseline on every metric, for every target. Differences only — never a verdict on their own. */
export function BaselineComparison({ evaluation }: { evaluation: BacktestEvaluation }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {THRESHOLDS.map((t) => {
        const r = evaluation.perThreshold[t.key]!;
        const rows: Row[] = [
          { label: "Accuracy", model: r.accuracy, base: r.baseline_accuracy, fmt: "pct" },
          { label: "Precision", model: r.precision, base: r.baseline_precision, fmt: "pct", neutral: true },
          { label: "Recall", model: r.recall, base: r.baseline_recall, fmt: "pct", neutral: true },
          { label: "F1", model: r.f1, base: r.baseline_f1, fmt: "num", neutral: true },
          { label: "ROC-AUC", model: r.roc_auc, base: r.baseline_roc_auc, fmt: "num" },
          { label: "Brier", model: r.brier, base: r.baseline_brier, fmt: "num", lowerIsBetter: true },
          { label: "Calibration (ECE)", model: r.ece, base: r.baseline_ece, fmt: "pct", lowerIsBetter: true },
        ];
        return (
          <Card key={t.key} hover>
            <CardHeader
              eyebrow={`Base rate ${pct(r.base_rate)} · n = ${r.n.toLocaleString("en-US")}`}
              title={`Will the next round reach ${t.label}?`}
              action={<VerdictChip verdict={r.verdict} />}
            />
            <CardBody className="pt-4">
              <table className="w-full text-sm tabular">
                <caption className="sr-only">Model versus baseline for {t.label}</caption>
                <thead className="text-[10px] tracking-[0.12em] text-ink-3 uppercase">
                  <tr className="border-b border-line">
                    <th className="py-2 text-left font-medium">Metric</th>
                    <th className="py-2 text-right font-medium">Model</th>
                    <th className="py-2 text-right font-medium">Baseline</th>
                    <th className="py-2 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const d = delta(row);
                    const f = (v: number | null) => (row.fmt === "pct" ? pct(v) : num(v, row.label === "Brier" ? 4 : 3));
                    return (
                      <tr key={row.label} className="border-b border-line/50">
                        <td className="py-2 text-ink-2">{row.label}</td>
                        <td className="py-2 text-right text-ink">{f(row.model)}</td>
                        <td className="py-2 text-right text-ink-3">{f(row.base)}</td>
                        <td className={cn("py-2 text-right text-xs", d.tone)}>{d.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                “—” precision = no positive calls made. Precision/recall/F1 deltas are shown neutrally: they trade off against each other at the
                50% threshold.{" "}
                Skill halves: {(r.stability.first_half_bss * 100).toFixed(2)}% → {(r.stability.second_half_bss * 100).toFixed(2)}% · Brier p ={" "}
                {r.brier_p_value < 0.0001 ? "<0.0001" : r.brier_p_value.toFixed(4)}
              </p>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
