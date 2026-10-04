import "server-only";
import { env, mlConfigured } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { Confidence, Dataset, ThresholdKey, Verdict } from "@/types";

export interface MlTrainResponse {
  summary: {
    model_version: string;
    created_at: string;
    dataset: Dataset;
    training_samples: number;
    test_samples: number;
    accuracy: number;
    precision: number;
    recall: number;
    roc_auc: number | null;
    brier_score: number;
    baseline_accuracy: number;
  };
  splits: Record<string, number | string>;
  selection: Record<string, import("@/types").ThresholdSelection>;
  metrics: Record<string, unknown>;
  verdict: Verdict;
  confidence: Confidence;
  feature_names: string[];
  test_predictions: {
    round_index: number;
    round_time: string;
    probabilities: Record<ThresholdKey, number>;
    baseline_probabilities: Record<ThresholdKey, number>;
    predicted_class: string;
    actual_multiplier: number;
    actual_class: string;
  }[];
}

export interface MlPredictResponse {
  model_version: string;
  dataset: Dataset;
  probabilities: Record<ThresholdKey, number>;
  predicted_class: string;
  confidence: Confidence;
  verdict: Verdict;
  disclaimer: string;
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  if (!mlConfigured()) throw new HttpError(503, "ML service not configured — set ML_SERVICE_URL on the server.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.mlServiceToken) headers.Authorization = `Bearer ${env.mlServiceToken}`;
  let res: Response;
  try {
    res = await fetch(`${env.mlServiceUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "is unreachable";
    throw new HttpError(503, `ML service ${reason} at ${env.mlServiceUrl}.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`;
    throw new HttpError(res.status === 422 || res.status === 404 ? res.status : 502, `ML service: ${detail}`);
  }
  return body as T;
}

export const mlHealth = () =>
  call<{ status: string; service_version: string; auth_enabled: boolean; models_available: string[] }>("/health", {
    method: "GET",
    timeoutMs: 4_000,
  });

export const mlTrain = (rounds: { multiplier: number; round_time: string }[], dataset: Dataset) =>
  call<MlTrainResponse>("/train", { method: "POST", body: JSON.stringify({ rounds, dataset }), timeoutMs: 280_000 });

export const mlPredict = (modelVersion: string, multipliers: number[]) =>
  call<MlPredictResponse>("/predict", {
    method: "POST",
    body: JSON.stringify({ model_version: modelVersion, multipliers }),
  });
