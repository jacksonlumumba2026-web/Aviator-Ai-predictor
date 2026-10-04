import "server-only";
import { MIN_HISTORY, THRESHOLDS } from "@/lib/constants";
import { primaryResult } from "@/lib/evaluation";
import { HttpError } from "@/lib/http";
import type { Dataset, NewPrediction, Prediction, ThresholdKey } from "@/types";
import { mlPredict } from "./ml-client";
import { getRepository } from "./repository";

/** Fill in the actual outcome of pending live estimates once the next round exists. */
export async function resolvePendingPredictions(dataset: Dataset): Promise<number> {
  const repo = getRepository();
  const pending = await repo.pendingPredictions(dataset);
  if (!pending.length) return 0;
  const earliest = pending.reduce((min, p) => (p.based_on_round_time && p.based_on_round_time < min ? p.based_on_round_time : min), "9999");
  const { rows } = await repo.listRounds({ dataset, from: earliest }, { limit: 2000, offset: 0, order: "asc" });
  let resolved = 0;
  for (const p of pending) {
    if (!p.based_on_round_time) continue;
    const next = rows.find((r) => r.round_time > p.based_on_round_time!);
    if (!next) continue;
    await repo.updatePrediction(p.id, {
      actual_multiplier: next.multiplier,
      target_round_time: next.round_time,
      result: primaryResult(p.probability_2x, next.multiplier),
    });
    resolved++;
  }
  return resolved;
}

/**
 * Generate an experimental probability estimate for the next round using the
 * latest trained model for this dataset. Idempotent per (model, last round).
 */
export async function generateNextEstimate(dataset: Dataset): Promise<{ prediction: Prediction | NewPrediction; created: boolean }> {
  const repo = getRepository();
  const [run] = await repo.listModelRuns(dataset, 1);
  if (!run) throw new HttpError(409, "No trained model for this dataset yet — train one on the Models page.");

  const history = await repo.latestRounds(dataset, 500);
  if (history.length < MIN_HISTORY) throw new HttpError(409, `Need at least ${MIN_HISTORY} stored rounds.`);
  const last = history[history.length - 1];

  const existing = (await repo.pendingPredictions(dataset)).find(
    (p) => p.model_version === run.model_version && p.based_on_round_time === last.round_time,
  );
  if (existing) return { prediction: existing, created: false };

  const out = await mlPredict(run.model_version, history.map((r) => r.multiplier));

  // Baseline = historical base rate using only rounds up to now (same information set).
  const all = await repo.allRounds({ dataset });
  const baseline = Object.fromEntries(
    THRESHOLDS.map((t) => [t.key, all.filter((r) => r.multiplier >= t.value).length / all.length]),
  ) as Record<ThresholdKey, number>;

  const row: NewPrediction = {
    prediction_time: new Date().toISOString(),
    model_version: run.model_version,
    model_run_id: run.id,
    kind: "live",
    is_demo: dataset === "demo",
    based_on_round_time: last.round_time,
    probability_1_5x: out.probabilities["1.5x"],
    probability_2x: out.probabilities["2x"],
    probability_3x: out.probabilities["3x"],
    probability_5x: out.probabilities["5x"],
    probability_10x: out.probabilities["10x"],
    baseline,
    features: out.features,
    // The final model was fit on every round of its training run.
    train_end_round_time: String(run.report.splits.test_end_time ? new Date(String(run.report.splits.test_end_time)).toISOString() : last.round_time),
    target_round_time: null,
    confidence: out.confidence,
    predicted_class: out.predicted_class,
    actual_multiplier: null,
    result: "pending",
  };
  await repo.insertPredictions([row]);
  return { prediction: row, created: true };
}
