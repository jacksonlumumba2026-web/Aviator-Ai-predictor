import type { ThresholdKey } from "@/types";

export const APP_NAME = "Aviator AI Lab";

export const THRESHOLDS: readonly { key: ThresholdKey; value: number; column: string; label: string }[] = [
  { key: "1.5x", value: 1.5, column: "probability_1_5x", label: "≥1.5x" },
  { key: "2x", value: 2, column: "probability_2x", label: "≥2x" },
  { key: "3x", value: 3, column: "probability_3x", label: "≥3x" },
  { key: "5x", value: 5, column: "probability_5x", label: "≥5x" },
  { key: "10x", value: 10, column: "probability_10x", label: "≥10x" },
] as const;

/** The binary target whose call determines a prediction's correct/incorrect result. */
export const PRIMARY_THRESHOLD: ThresholdKey = "2x";

export const DISCLAIMER =
  "Experimental statistical analysis. Results are uncertain and do not guarantee future outcomes or profits.";
export const ESTIMATE_LABEL = "Experimental statistical estimate — not a guaranteed prediction.";
export const DEMO_LABEL = "DEMO DATA — NOT REAL GAME RESULTS";
export const NO_EDGE_LABEL = "No statistically meaningful predictive edge detected.";
export const LIVE_NOT_CONNECTED = "Live feed not connected — using stored historical data.";

/** Statistical testing parameters — must match ml/aviator_ml/config.py. */
export const ALPHA = 0.05;
export const MIN_TEST_SAMPLES = 200;
export const MIN_CLASS_COUNT = 10;
export const DECISION_THRESHOLD = 0.5;
export const CALIBRATION_BINS = 10;

/** Rounds of history the ML feature builder needs before a prediction. */
export const MIN_HISTORY = 20;
export const MAX_MULTIPLIER = 1_000_000;
/** A live source counts as connected if it delivered data this recently. */
export const LIVE_STALE_MS = 5 * 60 * 1000;
