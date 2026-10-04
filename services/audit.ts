import "server-only";
import { THRESHOLDS } from "@/lib/constants";
import { primaryResult, probabilityOf } from "@/lib/evaluation";
import { HttpError } from "@/lib/http";
import type { ModelRun, Prediction } from "@/types";
import { mlFeatures, mlReplay } from "./ml-client";
import { getRepository } from "./repository";

export interface AuditCheck {
  name: string;
  status: "pass" | "fail" | "skipped";
  detail: string;
}

export interface PredictionAudit {
  prediction: Prediction;
  run: ModelRun | null;
  checks: AuditCheck[];
}

const TOL = 1e-9;

/**
 * Independently re-derives a stored prediction from the database:
 *  - the input history really ends at based_on_round_time;
 *  - the stored feature snapshot equals features recomputed from stored rounds;
 *  - the producing model was trained only on rounds before the target;
 *  - (live) the stored model artifact reproduces the stored probabilities;
 *  - the recorded outcome matches the stored round and the scoring rule.
 */
export async function auditPrediction(id: string): Promise<PredictionAudit> {
  const repo = getRepository();
  const p = await repo.getPrediction(id);
  if (!p) throw new HttpError(404, "Prediction not found");
  const run = p.model_run_id ? await repo.getModelRun(p.model_run_id) : null;
  const dataset = p.is_demo ? "demo" : "real";
  const checks: AuditCheck[] = [];
  const add = (name: string, ok: boolean | null, detail: string) =>
    checks.push({ name, status: ok === null ? "skipped" : ok ? "pass" : "fail", detail });

  // Input history: the 200 rounds up to and including based_on_round_time.
  let history: number[] = [];
  if (p.based_on_round_time) {
    const { rows } = await repo.listRounds({ dataset, to: p.based_on_round_time }, { limit: 200, offset: 0, order: "desc" });
    history = rows.reverse().map((r) => r.multiplier);
    const last = rows[rows.length - 1];
    add(
      "Input history ends at the recorded round",
      !!last && last.round_time === p.based_on_round_time,
      last ? `last input round ${last.round_time}` : "no stored rounds before this prediction",
    );
    if (p.target_round_time) {
      const between = await repo.listRounds(
        { dataset, from: p.based_on_round_time, to: p.target_round_time },
        { limit: 5, offset: 0, order: "asc" },
      );
      add(
        "Target is the very next stored round",
        between.total === 2,
        `${between.total - 2} stored round(s) between input and target`,
      );
    }
  } else add("Input history ends at the recorded round", null, "no based_on_round_time stored");

  if (p.features && history.length >= 20) {
    try {
      const { features } = await mlFeatures(history);
      const keys = Object.keys(p.features);
      const diffs = keys.map((k) => Math.abs((features[k] ?? NaN) - p.features![k]));
      const max = Math.max(...diffs);
      add("Feature snapshot matches features recomputed from the database", max < TOL && keys.length === Object.keys(features).length, `${keys.length} features, max |Δ| = ${max.toExponential(2)}`);
    } catch (e) {
      add("Feature snapshot matches features recomputed from the database", null, e instanceof Error ? e.message : "ML service unavailable");
    }
  } else add("Feature snapshot matches features recomputed from the database", null, p.features ? "fewer than 20 input rounds" : "no snapshot stored (pre-audit prediction)");

  const target = p.target_round_time;
  if (p.train_end_round_time) {
    const ok = !target || p.train_end_round_time < target;
    add("Model trained only on rounds before the target", ok, `training window ends ${p.train_end_round_time}${target ? `, target ${target}` : ""}`);
  } else add("Model trained only on rounds before the target", null, "training window not recorded");

  if (p.kind === "live" && p.features) {
    try {
      const out = await mlReplay(p.model_version, p.features);
      const max = Math.max(...THRESHOLDS.map((t) => Math.abs(out.probabilities[t.key] - probabilityOf(p, t.key))));
      add("Stored model reproduces the stored probabilities", max < TOL, `max |Δp| = ${max.toExponential(2)} (replayed ${p.model_version})`);
    } catch (e) {
      add("Stored model reproduces the stored probabilities", null, e instanceof Error ? e.message : "replay failed");
    }
  } else
    add(
      "Stored model reproduces the stored probabilities",
      null,
      p.kind === "backtest" ? "backtest models are intermediate walk-forward refits and are not persisted; covered by ML unit tests" : "no snapshot",
    );

  if (p.actual_multiplier !== null && target) {
    const { rows } = await repo.listRounds({ dataset, from: target, to: target }, { limit: 1, offset: 0, order: "asc" });
    add("Recorded outcome matches the stored round", rows[0]?.multiplier === p.actual_multiplier, `stored round at target: ${rows[0]?.multiplier ?? "missing"}x`);
    add("Outcome scored by the ≥2x rule", primaryResult(p.probability_2x, p.actual_multiplier) === p.result, `p(≥2x)=${(p.probability_2x * 100).toFixed(1)}%, actual ${p.actual_multiplier}x → ${p.result}`);
  } else add("Recorded outcome matches the stored round", null, "outcome not yet revealed");

  return { prediction: p, run, checks };
}
