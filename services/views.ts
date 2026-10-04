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
  const runs = await repo.listModelRuns(dataset, 100);
  const run = runs[0];
  if (!run) return { run: null, rows: [], evaluation: null, testWindowRuns: 0 };
  const rows = await repo.allPredictions({ dataset, kind: "backtest", modelRunId: run.id });
  // How many runs have been scored on exactly this test window (repeated looks weaken evidence).
  const fp = run.report.splits.test_fingerprint;
  const testWindowRuns = fp ? runs.filter((r) => r.report.splits.test_fingerprint === fp).length : 1;
  return { run, rows, evaluation: evaluatePredictions(rows), testWindowRuns };
}
