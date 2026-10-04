import { describe, expect, it } from "vitest";
import { evaluateThreshold, rocAuc, primaryResult, tierFromProbabilities } from "../evaluation";

// Shared fixture mirrored in ml/tests/test_metrics.py. Expected values were
// produced by the Python implementation — both sides must agree.
const Y = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1];
const P = [0.9, 0.2, 0.6, 0.55, 0.4, 0.1, 0.7, 0.65, 0.3, 0.45, 0.5, 0.8];
const B = new Array(12).fill(0.5);

describe("evaluateThreshold parity with Python", () => {
  const r = evaluateThreshold(Y, P, B, 5);
  it("matches confusion matrix and accuracy", () => {
    expect(r.confusion_matrix).toEqual({ tp: 5, fp: 2, tn: 4, fn: 1 });
    expect(r.accuracy).toBeCloseTo(9 / 12, 12);
    expect(r.f1).toBeCloseTo(0.7692307692307692, 12);
  });
  it("matches ROC-AUC and its CI", () => {
    expect(r.roc_auc).toBeCloseTo(0.8888888888888888, 12);
    expect(r.roc_auc_ci![0]).toBeCloseTo(0.6873793941862022, 10);
    expect(r.roc_auc_ci![1]).toBe(1);
  });
  it("matches Brier statistics and tests", () => {
    expect(r.brier).toBeCloseTo(0.148125, 12);
    expect(r.baseline_brier).toBeCloseTo(0.25, 12);
    expect(r.brier_p_value).toBeCloseTo(0.0029710932239475673, 6);
    expect(r.brier_improvement_ci[0]).toBeCloseTo(0.029292440669911796, 10);
    expect(r.mcnemar_p).toBeCloseTo(0.37109336952269756, 6);
    expect(r.accuracy_ci[0]).toBeCloseTo(0.46769466506643426, 10);
    expect(r.ece).toBeCloseTo(0.1375, 10);
  });
  it("refuses a verdict on tiny samples", () => {
    expect(r.verdict).toBe("insufficient_data");
  });
});

describe("verdicts", () => {
  it("constant model equal to baseline has no edge", () => {
    const y = Array.from({ length: 1000 }, (_, i) => (i * 7919) % 2);
    const r = evaluateThreshold(y, new Array(1000).fill(0.5), new Array(1000).fill(0.5));
    expect(r.verdict).toBe("no_edge");
  });
  it("informative model shows an edge", () => {
    const y = Array.from({ length: 1000 }, (_, i) => ((i * 7919) % 13) % 2);
    const p = y.map((v) => (v ? 0.8 : 0.2));
    const r = evaluateThreshold(y, p, new Array(1000).fill(0.5));
    expect(r.verdict).toBe("edge_detected");
  });
});

describe("helpers", () => {
  it("auc handles ties and single class", () => {
    expect(rocAuc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBe(0.5);
    expect(rocAuc([1, 1], [0.1, 0.2])).toBeNull();
  });
  it("tier and primary result", () => {
    expect(tierFromProbabilities({ "1.5x": 0.66, "2x": 0.49, "3x": 0.3, "5x": 0.2, "10x": 0.1 })).toBe(">=1.5x");
    expect(tierFromProbabilities({ "1.5x": 0.4, "2x": 0.3, "3x": 0.3, "5x": 0.2, "10x": 0.1 })).toBe("<1.5x");
    expect(primaryResult(0.49, 1.3)).toBe("correct");
    expect(primaryResult(0.49, 2.0)).toBe("incorrect");
  });
});
