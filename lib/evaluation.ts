/**
 * Out-of-sample evaluation, recomputed in the frontend from *stored*
 * prediction rows. Mirrors ml/aviator_ml/evaluation/metrics.py exactly —
 * deterministic tests only, so both sides produce identical numbers.
 */
import { ALPHA, CALIBRATION_BINS, DECISION_THRESHOLD, MIN_CLASS_COUNT, MIN_TEST_SAMPLES, THRESHOLDS } from "./constants";
import { erfc, normalSf, wilson, Z95 } from "./stats";
import type { Confidence, Prediction, ThresholdKey, Verdict } from "@/types";

export interface CalibrationBin {
  bin_lower: number;
  bin_upper: number;
  count: number;
  mean_predicted: number | null;
  observed_rate: number | null;
}

export interface ThresholdEvaluation {
  n: number;
  positives: number;
  base_rate: number;
  accuracy: number;
  accuracy_ci: [number, number];
  baseline_accuracy: number;
  baseline_accuracy_ci: [number, number];
  accuracy_improvement: number;
  mcnemar_p: number;
  precision: number | null;
  recall: number;
  f1: number;
  positive_predictions: number;
  roc_auc: number | null;
  roc_auc_ci: [number, number] | null;
  brier: number;
  baseline_brier: number;
  brier_skill_score: number;
  brier_improvement: number;
  brier_improvement_ci: [number, number];
  brier_z: number;
  brier_p_value: number;
  alpha_adjusted: number;
  calibration: CalibrationBin[];
  ece: number;
  confusion_matrix: { tp: number; fp: number; tn: number; fn: number };
  baseline_precision: number | null;
  baseline_recall: number;
  baseline_f1: number;
  baseline_roc_auc: number | null;
  baseline_ece: number;
  stability: { first_half_bss: number; second_half_bss: number };
  verdict: Verdict;
}

export type SignalLevel = "NO_RELIABLE_EDGE" | "WEAK_SIGNAL" | "PROMISING_SIGNAL" | "STRONGER_SIGNAL" | "INSUFFICIENT_DATA";

export function rocAuc(y: readonly number[], p: readonly number[]): number | null {
  const n = y.length;
  let n1 = 0;
  for (const v of y) n1 += v;
  const n0 = n - n1;
  if (n1 === 0 || n0 === 0) return null;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b] || a - b);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && p[order[j + 1]] === p[order[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = r;
    i = j + 1;
  }
  let sumPos = 0;
  for (let k = 0; k < n; k++) if (y[k] === 1) sumPos += ranks[k];
  return (sumPos - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

export function aucInterval(auc: number | null, n1: number, n0: number): [number, number] | null {
  if (auc === null || n1 === 0 || n0 === 0) return null;
  const a = auc;
  const q1 = a / (2 - a);
  const q2 = (2 * a * a) / (1 + a);
  const v = (a * (1 - a) + (n1 - 1) * (q1 - a * a) + (n0 - 1) * (q2 - a * a)) / (n1 * n0);
  const se = Math.sqrt(Math.max(v, 0));
  return [Math.max(0, a - Z95 * se), Math.min(1, a + Z95 * se)];
}

export function calibrationBins(y: readonly number[], p: readonly number[], nBins = CALIBRATION_BINS): CalibrationBin[] {
  const sums = Array.from({ length: nBins }, () => ({ c: 0, sp: 0, sy: 0 }));
  for (let i = 0; i < y.length; i++) {
    const b = Math.min(Math.floor(p[i] * nBins), nBins - 1);
    sums[b].c++;
    sums[b].sp += p[i];
    sums[b].sy += y[i];
  }
  return sums.map((s, b) => ({
    bin_lower: b / nBins,
    bin_upper: (b + 1) / nBins,
    count: s.c,
    mean_predicted: s.c ? s.sp / s.c : null,
    observed_rate: s.c ? s.sy / s.c : null,
  }));
}

export function mcnemarP(modelCorrect: readonly boolean[], baseCorrect: readonly boolean[]): number {
  let b = 0;
  let c = 0;
  for (let i = 0; i < modelCorrect.length; i++) {
    if (modelCorrect[i] && !baseCorrect[i]) b++;
    else if (!modelCorrect[i] && baseCorrect[i]) c++;
  }
  if (b + c === 0) return 1;
  const chi2 = (Math.abs(b - c) - 1) ** 2 / (b + c);
  return erfc(Math.sqrt(chi2 / 2));
}

function classification(y: readonly number[], pred: readonly number[]) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < y.length; i++) {
    if (pred[i] === 1 && y[i] === 1) tp++;
    else if (pred[i] === 1) fp++;
    else if (y[i] === 1) fn++;
  }
  // Precision is undefined (null) when no positive calls are made.
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision && precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}

function eceOf(bins: CalibrationBin[], n: number) {
  return n ? bins.reduce((acc, b) => (b.count ? acc + (b.count / n) * Math.abs(b.mean_predicted! - b.observed_rate!) : acc), 0) : 0;
}

function bssOf(y: readonly number[], p: readonly number[], b: readonly number[]) {
  if (!y.length) return 0;
  let e = 0, eb = 0;
  for (let i = 0; i < y.length; i++) {
    e += (p[i] - y[i]) ** 2;
    eb += (b[i] - y[i]) ** 2;
  }
  return eb > 0 ? 1 - e / eb : 0;
}

export function evaluateThreshold(
  y: readonly number[],
  p: readonly number[],
  base: readonly number[],
  nComparisons: number = THRESHOLDS.length,
): ThresholdEvaluation {
  const n = y.length;
  let nPos = 0;
  let tp = 0, fp = 0, tn = 0, fn = 0;
  let correctCount = 0, baseCorrectCount = 0;
  let brierSum = 0, baseBrierSum = 0;
  const correct: boolean[] = [];
  const baseCorrect: boolean[] = [];
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const yi = y[i];
    nPos += yi;
    const pred = p[i] >= DECISION_THRESHOLD ? 1 : 0;
    const bpred = base[i] >= DECISION_THRESHOLD ? 1 : 0;
    if (pred === 1 && yi === 1) tp++;
    else if (pred === 1) fp++;
    else if (yi === 0) tn++;
    else fn++;
    const ok = pred === yi;
    const bok = bpred === yi;
    correct.push(ok);
    baseCorrect.push(bok);
    correctCount += ok ? 1 : 0;
    baseCorrectCount += bok ? 1 : 0;
    const e = (p[i] - yi) ** 2;
    const eb = (base[i] - yi) ** 2;
    brierSum += e;
    baseBrierSum += eb;
    d.push(eb - e);
  }
  const nNeg = n - nPos;
  const accuracy = n ? correctCount / n : 0;
  const baselineAccuracy = n ? baseCorrectCount / n : 0;
  const { precision, recall, f1 } = classification(
    y,
    p.map((v) => (v >= DECISION_THRESHOLD ? 1 : 0)),
  );
  const brier = n ? brierSum / n : 0;
  const baselineBrier = n ? baseBrierSum / n : 0;
  const bss = baselineBrier > 0 ? 1 - brier / baselineBrier : 0;

  const dMean = n ? d.reduce((a, b) => a + b, 0) / n : 0;
  let dSe = 0;
  if (n > 1) {
    let ss = 0;
    for (const v of d) ss += (v - dMean) ** 2;
    dSe = Math.sqrt(ss / (n - 1)) / Math.sqrt(n);
  }
  let z = 0;
  let pBrier: number;
  let ci: [number, number];
  if (dSe > 0) {
    z = dMean / dSe;
    pBrier = normalSf(z);
    ci = [dMean - Z95 * dSe, dMean + Z95 * dSe];
  } else {
    pBrier = dMean <= 0 ? 1 : 0;
    ci = [dMean, dMean];
  }

  const auc = rocAuc(y, p);
  const aucCi = aucInterval(auc, nPos, nNeg);
  const calibration = calibrationBins(y, p);
  const ece = eceOf(calibration, n);
  const baseCls = classification(y, base.map((v) => (v >= DECISION_THRESHOLD ? 1 : 0)));
  const half = Math.floor(n / 2);
  const stability = {
    first_half_bss: bssOf(y.slice(0, half), p.slice(0, half), base.slice(0, half)),
    second_half_bss: bssOf(y.slice(half), p.slice(half), base.slice(half)),
  };

  const alphaAdj = ALPHA / Math.max(nComparisons, 1);
  const sufficient = n >= MIN_TEST_SAMPLES && nPos >= MIN_CLASS_COUNT && nNeg >= MIN_CLASS_COUNT;
  const edge = sufficient && pBrier < alphaAdj && aucCi !== null && aucCi[0] > 0.5;
  const accCi = wilson(correctCount, n);
  const baseCi = wilson(baseCorrectCount, n);

  return {
    n,
    positives: nPos,
    base_rate: n ? nPos / n : 0,
    accuracy,
    accuracy_ci: [accCi.lower, accCi.upper],
    baseline_accuracy: baselineAccuracy,
    baseline_accuracy_ci: [baseCi.lower, baseCi.upper],
    accuracy_improvement: accuracy - baselineAccuracy,
    mcnemar_p: mcnemarP(correct, baseCorrect),
    precision,
    recall,
    f1,
    positive_predictions: tp + fp,
    roc_auc: auc,
    roc_auc_ci: aucCi,
    brier,
    baseline_brier: baselineBrier,
    brier_skill_score: bss,
    brier_improvement: dMean,
    brier_improvement_ci: ci,
    brier_z: z,
    brier_p_value: pBrier,
    alpha_adjusted: alphaAdj,
    calibration,
    ece,
    confusion_matrix: { tp, fp, tn, fn },
    baseline_precision: baseCls.precision,
    baseline_recall: baseCls.recall,
    baseline_f1: baseCls.f1,
    // A base-rate predictor has no discriminative ability: AUC 0.5 by definition.
    baseline_roc_auc: 0.5,
    baseline_ece: eceOf(calibrationBins(y, base), n),
    stability,
    verdict: !sufficient ? "insufficient_data" : edge ? "edge_detected" : "no_edge",
  };
}

export function overallVerdict(results: Partial<Record<ThresholdKey, ThresholdEvaluation>>): Verdict {
  const v = Object.values(results).map((r) => r!.verdict);
  if (v.some((x) => x === "edge_detected")) return "edge_detected";
  if (v.length && v.every((x) => x === "insufficient_data")) return "insufficient_data";
  return "no_edge";
}

/** Conservative evidence classification — mirrors classify_signal() in Python. */
export function classifySignal(results: Partial<Record<ThresholdKey, ThresholdEvaluation>>): SignalLevel {
  const rows = Object.values(results) as ThresholdEvaluation[];
  if (!rows.length || rows.every((r) => r.verdict === "insufficient_data")) return "INSUFFICIENT_DATA";
  const passed = rows.filter((r) => r.verdict === "edge_detected");
  const replicated = passed.filter((r) => r.n >= 1000 && r.stability.first_half_bss > 0 && r.stability.second_half_bss > 0);
  if (replicated.length >= 2) return "STRONGER_SIGNAL";
  if (passed.length) return "PROMISING_SIGNAL";
  const nominal = rows.some(
    (r) => r.verdict !== "insufficient_data" && r.brier_p_value < ALPHA && r.brier_skill_score > 0 && (r.roc_auc ?? 0) > 0.5,
  );
  return nominal ? "WEAK_SIGNAL" : "NO_RELIABLE_EDGE";
}

export function confidenceFrom(results: Partial<Record<ThresholdKey, ThresholdEvaluation>>): Confidence {
  const s = classifySignal(results);
  return s === "STRONGER_SIGNAL" ? "HIGH" : s === "PROMISING_SIGNAL" ? "MEDIUM" : "LOW";
}

export function probabilityOf(p: Prediction, key: ThresholdKey): number {
  const col = THRESHOLDS.find((t) => t.key === key)!.column as keyof Prediction;
  return p[col] as number;
}

export interface BacktestEvaluation {
  total: number;
  resolved: number;
  perThreshold: Partial<Record<ThresholdKey, ThresholdEvaluation>>;
  verdict: Verdict;
  signal: SignalLevel;
  confidence: Confidence;
}

/** Evaluate resolved prediction rows (backtest or live) for every threshold. */
export function evaluatePredictions(rows: readonly Prediction[]): BacktestEvaluation {
  const resolved = rows.filter((r) => r.actual_multiplier !== null && r.baseline);
  const perThreshold: Partial<Record<ThresholdKey, ThresholdEvaluation>> = {};
  for (const t of THRESHOLDS) {
    const y = resolved.map((r) => (Number(r.actual_multiplier) >= t.value ? 1 : 0));
    const p = resolved.map((r) => probabilityOf(r, t.key));
    const b = resolved.map((r) => r.baseline?.[t.key] ?? 0);
    perThreshold[t.key] = evaluateThreshold(y, p, b);
  }
  return {
    total: rows.length,
    resolved: resolved.length,
    perThreshold,
    verdict: resolved.length ? overallVerdict(perThreshold) : "insufficient_data",
    signal: resolved.length ? classifySignal(perThreshold) : "INSUFFICIENT_DATA",
    confidence: confidenceFrom(perThreshold),
  };
}

/** Highest threshold whose probability is ≥ 50%. */
export function tierFromProbabilities(probs: Record<ThresholdKey, number>): string {
  let label = `<${THRESHOLDS[0].key}`;
  for (const t of THRESHOLDS) if (probs[t.key] >= 0.5) label = `>=${t.key}`;
  return label;
}

/** Correctness of the primary ≥2x call (predict ≥2x iff p ≥ 0.5). */
export function primaryResult(p2x: number, actual: number): "correct" | "incorrect" {
  return (p2x >= DECISION_THRESHOLD) === (actual >= 2) ? "correct" : "incorrect";
}
