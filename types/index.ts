/** Which dataset an analysis runs on. Demo and real data are never mixed. */
export type Dataset = "real" | "demo";

export type ThresholdKey = "1.5x" | "2x" | "3x" | "5x" | "10x";

export interface Round {
  id: string;
  multiplier: number;
  round_time: string;
  source: string;
  is_demo: boolean;
  created_at: string;
}

export interface NewRound {
  multiplier: number;
  round_time: string;
  source: string;
  is_demo: boolean;
}

export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type PredictionResult = "pending" | "correct" | "incorrect";
export type Verdict = "edge_detected" | "no_edge" | "insufficient_data";

export interface Prediction {
  id: string;
  prediction_time: string;
  model_version: string;
  model_run_id: string | null;
  kind: "backtest" | "live";
  is_demo: boolean;
  based_on_round_time: string | null;
  probability_1_5x: number;
  probability_2x: number;
  probability_3x: number;
  probability_5x: number;
  probability_10x: number;
  baseline: Partial<Record<ThresholdKey, number>> | null;
  confidence: Confidence;
  predicted_class: string;
  actual_multiplier: number | null;
  result: PredictionResult;
  created_at: string;
}

export type NewPrediction = Omit<Prediction, "id" | "created_at">;

export interface ThresholdSelection {
  selected_model: string;
  validation_scores: Record<string, { brier: number; log_loss: number; roc_auc: number | null }>;
  beats_base_rate_on_validation: boolean;
}

export interface ModelRunReport {
  splits: Record<string, number | string>;
  selection: Record<string, ThresholdSelection>;
  metrics: Record<string, unknown>;
  feature_names: string[];
}

export interface ModelRun {
  id: string;
  model_version: string;
  is_demo: boolean;
  training_samples: number;
  validation_samples: number;
  test_samples: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  roc_auc: number | null;
  brier_score: number | null;
  baseline_accuracy: number | null;
  verdict: Verdict;
  confidence: Confidence;
  report: ModelRunReport;
  created_at: string;
}

export type NewModelRun = Omit<ModelRun, "id" | "created_at">;

export type SourceType = "manual" | "csv" | "api" | "live_feed" | "demo";

export interface DataSource {
  id: string;
  source_name: string;
  source_type: SourceType;
  enabled: boolean;
  last_update: string | null;
  notes: string | null;
  created_at: string;
}
