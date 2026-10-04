import "server-only";
import { tierFromProbabilities, primaryResult } from "@/lib/evaluation";
import { HttpError } from "@/lib/http";
import type { Confidence, Dataset, NewPrediction, ValidationRun, ValidationStage } from "@/types";
import { mlProtocolDescribe, mlProtocolInfo, mlProtocolJob, mlProtocolStart, type ProtocolInfo } from "./ml-client";
import { getRepository } from "./repository";

const confidenceFor = (c: string): Confidence => (c === "STRONGER_SIGNAL" ? "HIGH" : c === "PROMISING_SIGNAL" ? "MEDIUM" : "LOW");

export interface ProtocolStatus {
  info: ProtocolInfo | null;
  infoError: string | null;
  rounds: number;
  runs: ValidationRun[];
  finalTest: ValidationRun | null;
  confirmation: ValidationRun | null;
  roundsAfterFinalTest: number;
}

export async function protocolStatus(dataset: Dataset): Promise<ProtocolStatus> {
  const repo = getRepository();
  const [runs, rounds, info] = await Promise.all([
    repo.listValidationRuns(dataset),
    repo.countRounds(dataset),
    mlProtocolInfo().then((i) => ({ i, e: null }), (e: Error) => ({ i: null, e: e.message })),
  ]);
  const finalTest = runs.find((r) => r.stage === "final_test" && r.status !== "failed") ?? null;
  const confirmation = finalTest ? (runs.find((r) => r.stage === "confirmation" && r.parent_run_id === finalTest.id && r.status !== "failed") ?? null) : null;
  let roundsAfterFinalTest = 0;
  if (finalTest) {
    const after = await repo.listRounds({ dataset, from: finalTest.window_end }, { limit: 1, offset: 0, order: "asc" });
    roundsAfterFinalTest = Math.max(0, after.total - 1); // `from` is inclusive of the window's last round
  }
  return { info: info.i, infoError: info.e, rounds, runs, finalTest, confirmation, roundsAfterFinalTest };
}

/**
 * Pre-register then start a protocol stage. The window is registered (with its
 * fingerprint, the protocol hash and the data hash) BEFORE evaluation; the
 * database's uniqueness constraint makes a second look at the same window
 * impossible. A failed run (no metrics produced) may be retried.
 */
export async function startStage(dataset: Dataset, stage: ValidationStage, overrides?: Record<string, number>): Promise<ValidationRun> {
  if (overrides && dataset === "real") throw new HttpError(422, "Protocol requirements cannot be overridden for REAL data.");
  const repo = getRepository();
  const status = await protocolStatus(dataset);
  if (dataset === "real" && !status.info?.frozen_and_unchanged)
    throw new HttpError(409, "The validation protocol is not frozen or its code changed since freezing — REAL-data evaluation refused.");

  let stage1: ValidationRun | null = null;
  if (stage === "confirmation") {
    stage1 = status.finalTest;
    if (!stage1 || stage1.status !== "completed" || !stage1.result) throw new HttpError(409, "Run and complete the final test first.");
    if (status.confirmation && status.confirmation.status !== "failed") throw new HttpError(409, "The confirmation window has already been evaluated.");
  } else if (status.finalTest) {
    throw new HttpError(409, "A final test has already been evaluated (or is running) for this dataset. It cannot be re-run.");
  }

  const rounds = (await repo.allRounds({ dataset })).map((r) => ({ multiplier: r.multiplier, round_time: r.round_time }));
  const body = { rounds, dataset, stage, stage1: stage1?.result ?? null, overrides };
  const desc = await mlProtocolDescribe(body);

  let run: ValidationRun;
  try {
    run = await repo.insertValidationRun({
      dataset,
      stage,
      status: "registered",
      protocol_version: desc.protocol_version,
      protocol_sha256: desc.protocol_sha256,
      data_sha256: desc.data_sha256,
      window_fingerprint: desc.window_fingerprint,
      window_start: desc.window_start,
      window_end: desc.window_end,
      window_rounds: desc.window_rounds,
      development_rounds: desc.development_rounds,
      parent_run_id: stage1?.id ?? null,
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ALREADY_EVALUATED")) throw e;
    const prior = (await repo.listValidationRuns(dataset)).find(
      (r) => r.stage === stage && r.protocol_sha256 === desc.protocol_sha256 && r.window_fingerprint === desc.window_fingerprint,
    );
    if (!prior || prior.status !== "failed") throw new HttpError(409, "This window has already been evaluated under this protocol. It cannot be re-run.");
    run = prior; // a failed run produced no metrics: retry in place
  }
  const job = await mlProtocolStart(body);
  await repo.updateValidationRun(run.id, { status: "running", job_id: job.id, error: null });
  return { ...run, status: "running", job_id: job.id };
}

/** Poll the ML job; on completion persist the result and every prediction (audit trail). */
export async function refreshRun(id: string): Promise<ValidationRun> {
  const repo = getRepository();
  const run = await repo.getValidationRun(id);
  if (!run) throw new HttpError(404, "Validation run not found");
  if (run.status !== "running" || !run.job_id) return run;
  const job = await mlProtocolJob(run.job_id);
  if (job.status === "failed") {
    await repo.updateValidationRun(id, { status: "failed", error: job.error ?? "failed" });
    return { ...run, status: "failed", error: job.error ?? "failed" };
  }
  if (job.status !== "completed" || !job.result) return run;
  const { predictions, ...result } = job.result;
  if (result.window_fingerprint !== run.window_fingerprint) {
    await repo.updateValidationRun(id, { status: "failed", error: "evaluated window does not match the registered window" });
    throw new HttpError(500, "Evaluated window does not match the pre-registered window.");
  }
  const cls = String(result.classification);
  const rows: NewPrediction[] = predictions.map((p) => ({
    prediction_time: new Date(p.round_time).toISOString(),
    target_round_time: new Date(p.round_time).toISOString(),
    train_end_round_time: new Date(p.train_end_round_time).toISOString(),
    based_on_round_time: new Date(p.based_on_round_time).toISOString(),
    model_version: `protocol:${run.protocol_version}:${run.stage}`,
    model_run_id: null,
    validation_run_id: run.id,
    kind: "backtest",
    dataset: run.dataset,
    probability_1_5x: p.probabilities["1.5x"],
    probability_2x: p.probabilities["2x"],
    probability_3x: p.probabilities["3x"],
    probability_5x: p.probabilities["5x"],
    probability_10x: p.probabilities["10x"],
    baseline: p.baseline_probabilities,
    features: p.features,
    confidence: confidenceFor(cls),
    predicted_class: tierFromProbabilities(p.probabilities),
    actual_multiplier: p.actual_multiplier,
    result: primaryResult(p.probabilities["2x"], p.actual_multiplier),
  }));
  await repo.insertPredictions(rows);
  const completed_at = new Date().toISOString();
  await repo.updateValidationRun(id, { status: "completed", result, classification: cls, completed_at });
  return { ...run, status: "completed", result, classification: cls, completed_at };
}
