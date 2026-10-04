/** Recomputes the latest run's out-of-sample metrics from stored prediction rows and cross-checks Python. */
import { getRepository } from "@/services/repository";
import { evaluatePredictions } from "@/lib/evaluation";
import { THRESHOLDS } from "@/lib/constants";

const dataset = (process.argv[2] as "real" | "demo") || "demo";
const repo = getRepository();
const [run] = await repo.listModelRuns(dataset, 1);
const rows = await repo.allPredictions({ dataset, kind: "backtest", modelRunId: run.id });
const ev = evaluatePredictions(rows);
const py = run.report.metrics as Record<string, Record<string, number>>;
const keys = ["accuracy", "baseline_accuracy", "precision", "recall", "f1", "roc_auc", "brier", "baseline_brier", "ece", "baseline_ece", "brier_p_value", "baseline_f1", "baseline_roc_auc"];
let maxDiff = 0;
const out: Record<string, unknown> = {};
for (const t of THRESHOLDS) {
  const r = ev.perThreshold[t.key]!;
  for (const k of keys) maxDiff = Math.max(maxDiff, Math.abs(((r as unknown as Record<string, number>)[k] ?? 0) - (py[t.key][k] ?? 0)));
  out[t.key] = {
    n: r.n, base_rate: r.base_rate, accuracy: r.accuracy, baseline_accuracy: r.baseline_accuracy, acc_ci: r.accuracy_ci,
    precision: r.precision, baseline_precision: r.baseline_precision, recall: r.recall, baseline_recall: r.baseline_recall,
    f1: r.f1, baseline_f1: r.baseline_f1, roc_auc: r.roc_auc, roc_auc_ci: r.roc_auc_ci, baseline_roc_auc: r.baseline_roc_auc,
    brier: r.brier, baseline_brier: r.baseline_brier, bss: r.brier_skill_score, brier_p: r.brier_p_value, mcnemar_p: r.mcnemar_p,
    ece: r.ece, baseline_ece: r.baseline_ece, positive_calls: r.positive_predictions, stability: r.stability, verdict: r.verdict,
    calibration: r.calibration.filter((b) => b.count).map((b) => [b.bin_lower, b.count, b.mean_predicted, b.observed_rate]),
  };
}
console.log(JSON.stringify({ model_version: run.model_version, splits: run.report.splits, selection: run.report.selection,
  features: run.report.feature_names, signal_ts: ev.signal, signal_py: run.report.signal, verdict_ts: ev.verdict, verdict_py: run.verdict,
  rows: rows.length, max_abs_diff_ts_vs_python: maxDiff, per_target: out }, null, 1));
