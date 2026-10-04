import type { DataSource, Dataset, ModelRun, NewModelRun, NewPrediction, NewRound, Prediction, Round } from "@/types";

export interface RoundFilter {
  dataset: Dataset;
  from?: string;
  to?: string;
  minMultiplier?: number;
  maxMultiplier?: number;
  source?: string;
}

export interface PredictionFilter {
  dataset: Dataset;
  kind?: "backtest" | "live";
  modelRunId?: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface Repository {
  readonly kind: "supabase" | "local";

  listRounds(filter: RoundFilter, opts: { limit: number; offset: number; order: "asc" | "desc" }): Promise<Page<Round>>;
  /** Every round matching the filter in chronological order. */
  allRounds(filter: RoundFilter): Promise<Round[]>;
  latestRounds(dataset: Dataset, n: number): Promise<Round[]>;
  countRounds(dataset: Dataset): Promise<number>;
  /** Which of the given ISO timestamps already exist in the dataset. */
  existingRoundTimes(dataset: Dataset, times: string[]): Promise<Set<string>>;
  insertRounds(rows: NewRound[]): Promise<number>;
  deleteRounds(dataset: Dataset, ids: string[]): Promise<number>;
  deleteAllRounds(dataset: Dataset): Promise<number>;

  insertPredictions(rows: NewPrediction[]): Promise<number>;
  listPredictions(filter: PredictionFilter, opts: { limit: number; offset: number }): Promise<Page<Prediction>>;
  allPredictions(filter: PredictionFilter): Promise<Prediction[]>;
  pendingPredictions(dataset: Dataset): Promise<Prediction[]>;
  getPrediction(id: string): Promise<Prediction | null>;
  updatePrediction(id: string, patch: Partial<Pick<Prediction, "actual_multiplier" | "result" | "target_round_time">>): Promise<void>;
  deletePredictions(dataset: Dataset): Promise<void>;

  insertModelRun(run: NewModelRun): Promise<ModelRun>;
  listModelRuns(dataset: Dataset, limit: number): Promise<ModelRun[]>;
  getModelRun(id: string): Promise<ModelRun | null>;
  deleteModelRuns(dataset: Dataset): Promise<void>;

  listDataSources(): Promise<DataSource[]>;
  getDataSource(name: string): Promise<DataSource | null>;
  upsertDataSource(src: Pick<DataSource, "source_name" | "source_type"> & Partial<DataSource>): Promise<DataSource>;
  updateDataSource(id: string, patch: Partial<Pick<DataSource, "enabled" | "notes" | "last_update">>): Promise<void>;
}
