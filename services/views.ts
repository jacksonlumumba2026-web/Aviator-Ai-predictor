import "server-only";
import { evaluatePredictions } from "@/lib/evaluation";
import { computeStats, rolling } from "@/lib/stats";
import type { Dataset } from "@/types";
import { getRepository } from "./repository";

export async function loadOverview(dataset: Dataset) {
  const repo = getRepository();
  const [rounds, runs, live] = await Promise.all([
    repo.allRounds({ dataset }),
    repo.listModelRuns(dataset, 1),
    repo.listPredictions({ dataset, kind: "live" }, { limit: 1, offset: 0 }),
  ]);
  const xs = rounds.map((r) => r.multiplier);
  return {
    rounds,
    stats: computeStats(xs),
    rolling50: rolling(xs, 50),
    latestRun: runs[0] ?? null,
    latestEstimate: live.rows[0] ?? null,
  };
}

export async function loadBacktest(dataset: Dataset) {
  const repo = getRepository();
  const [run] = await repo.listModelRuns(dataset, 1);
  if (!run) return { run: null, rows: [], evaluation: null };
  const rows = await repo.allPredictions({ dataset, kind: "backtest", modelRunId: run.id });
  return { run, rows, evaluation: evaluatePredictions(rows) };
}
