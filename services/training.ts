import "server-only";
import { primaryResult } from "@/lib/evaluation";
import { HttpError } from "@/lib/http";
import type { Dataset, ModelRun, NewPrediction } from "@/types";
import { mlTrain } from "./ml-client";
import { generateNextEstimate } from "./prediction";
import { getRepository } from "./repository";

export const MIN_TRAINING_ROUNDS = 320;

/**
 * Train + chronologically backtest on the full dataset, then store the run and
 * every out-of-sample test prediction so metrics can be recomputed from rows.
 */
export async function trainModel(dataset: Dataset): Promise<ModelRun> {
  const repo = getRepository();
  const rounds = await repo.allRounds({ dataset });
  if (rounds.length < MIN_TRAINING_ROUNDS) {
    throw new HttpError(422, `Need at least ${MIN_TRAINING_ROUNDS} rounds to train and test (have ${rounds.length}).`);
  }
  const res = await mlTrain(rounds.map((r) => ({ multiplier: r.multiplier, round_time: r.round_time })), dataset);

  const run = await repo.insertModelRun({
    model_version: res.summary.model_version,
    is_demo: dataset === "demo",
    training_samples: Number(res.splits.train),
    validation_samples: Number(res.splits.validation),
    test_samples: Number(res.splits.test),
    accuracy: res.summary.accuracy,
    precision: res.summary.precision,
    recall: res.summary.recall,
    roc_auc: res.summary.roc_auc,
    brier_score: res.summary.brier_score,
    baseline_accuracy: res.summary.baseline_accuracy,
    verdict: res.verdict,
    confidence: res.confidence,
    report: { splits: res.splits, selection: res.selection, metrics: res.metrics, feature_names: res.feature_names },
  });

  const byTime = new Map(rounds.map((r, i) => [r.round_time, i]));
  const rows: NewPrediction[] = res.test_predictions.map((p) => {
    const idx = byTime.get(new Date(p.round_time).toISOString());
    return {
      prediction_time: new Date(p.round_time).toISOString(),
      model_version: run.model_version,
      model_run_id: run.id,
      kind: "backtest",
      is_demo: dataset === "demo",
      based_on_round_time: idx !== undefined && idx > 0 ? rounds[idx - 1].round_time : null,
      probability_1_5x: p.probabilities["1.5x"],
      probability_2x: p.probabilities["2x"],
      probability_3x: p.probabilities["3x"],
      probability_5x: p.probabilities["5x"],
      probability_10x: p.probabilities["10x"],
      baseline: p.baseline_probabilities,
      confidence: res.confidence,
      predicted_class: p.predicted_class,
      actual_multiplier: p.actual_multiplier,
      result: primaryResult(p.probabilities["2x"], p.actual_multiplier),
    };
  });
  await repo.insertPredictions(rows);

  try {
    await generateNextEstimate(dataset);
  } catch (err) {
    console.warn("[train] initial estimate skipped:", err instanceof Error ? err.message : err);
  }
  return run;
}
