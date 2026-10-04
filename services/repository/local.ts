import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DataSource, Dataset, ModelRun, Prediction, Round } from "@/types";
import type { PredictionFilter, Repository, RoundFilter } from "./types";

/**
 * JSON-file store used ONLY when Supabase is not configured, so the lab can be
 * developed and tested offline. Not for production: single process, no
 * concurrency guarantees, and serverless filesystems are ephemeral.
 */
interface StoreData {
  seq: number;
  rounds: Round[];
  predictions: Prediction[];
  model_runs: ModelRun[];
  data_sources: DataSource[];
}

const DEFAULT_SOURCES: Omit<DataSource, "id" | "created_at">[] = [
  { source_name: "manual", source_type: "manual", enabled: true, last_update: null, notes: "Rounds entered by hand in the Data page." },
  { source_name: "csv_import", source_type: "csv", enabled: true, last_update: null, notes: "Historical rounds imported from CSV files." },
  { source_name: "demo", source_type: "demo", enabled: true, last_update: null, notes: "DEMO DATA — NOT REAL GAME RESULTS. Synthetic i.i.d. rounds for development and testing." },
];

const now = () => new Date().toISOString();
const isDemo = (d: Dataset) => d === "demo";
const byTime = (a: Round, b: Round) => (a.round_time < b.round_time ? -1 : a.round_time > b.round_time ? 1 : 0);

export class LocalRepository implements Repository {
  readonly kind = "local" as const;
  private data: StoreData | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file = path.join(process.cwd(), ".data", "local-store.json")) {}

  private async load(): Promise<StoreData> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, "utf8")) as StoreData;
    } catch {
      this.data = {
        seq: 0,
        rounds: [],
        predictions: [],
        model_runs: [],
        data_sources: DEFAULT_SOURCES.map((s) => ({ ...s, id: randomUUID(), created_at: now() })),
      };
    }
    return this.data;
  }

  private async mutate<T>(fn: (d: StoreData) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const d = await this.load();
      const out = fn(d);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d));
      await fs.rename(tmp, this.file);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private filterRounds(d: StoreData, f: RoundFilter) {
    return d.rounds.filter(
      (r) =>
        r.is_demo === isDemo(f.dataset) &&
        (!f.from || r.round_time >= f.from) &&
        (!f.to || r.round_time <= f.to) &&
        (f.minMultiplier === undefined || r.multiplier >= f.minMultiplier) &&
        (f.maxMultiplier === undefined || r.multiplier <= f.maxMultiplier) &&
        (!f.source || r.source === f.source),
    );
  }

  async listRounds(filter: RoundFilter, opts: { limit: number; offset: number; order: "asc" | "desc" }) {
    const rows = this.filterRounds(await this.load(), filter).sort(byTime);
    if (opts.order === "desc") rows.reverse();
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total: rows.length };
  }

  async allRounds(filter: RoundFilter) {
    return this.filterRounds(await this.load(), filter).sort(byTime);
  }

  async latestRounds(dataset: Dataset, n: number) {
    const rows = (await this.allRounds({ dataset }));
    return rows.slice(Math.max(0, rows.length - n));
  }

  async countRounds(dataset: Dataset) {
    return (await this.load()).rounds.filter((r) => r.is_demo === isDemo(dataset)).length;
  }

  async existingRoundTimes(dataset: Dataset, times: string[]) {
    const want = new Set(times);
    const found = new Set<string>();
    for (const r of (await this.load()).rounds) if (r.is_demo === isDemo(dataset) && want.has(r.round_time)) found.add(r.round_time);
    return found;
  }

  async insertRounds(rows: Parameters<Repository["insertRounds"]>[0]) {
    return this.mutate((d) => {
      const keys = new Set(d.rounds.map((r) => `${r.is_demo}|${r.round_time}`));
      let inserted = 0;
      for (const r of rows) {
        const k = `${r.is_demo}|${r.round_time}`;
        if (keys.has(k)) continue;
        keys.add(k);
        d.rounds.push({ ...r, id: String(++d.seq), created_at: now() });
        inserted++;
      }
      return inserted;
    });
  }

  async deleteRounds(dataset: Dataset, ids: string[]) {
    const del = new Set(ids);
    return this.mutate((d) => {
      const before = d.rounds.length;
      d.rounds = d.rounds.filter((r) => !(r.is_demo === isDemo(dataset) && del.has(r.id)));
      return before - d.rounds.length;
    });
  }

  async deleteAllRounds(dataset: Dataset) {
    return this.mutate((d) => {
      const before = d.rounds.length;
      d.rounds = d.rounds.filter((r) => r.is_demo !== isDemo(dataset));
      return before - d.rounds.length;
    });
  }

  async insertPredictions(rows: Parameters<Repository["insertPredictions"]>[0]) {
    return this.mutate((d) => {
      for (const r of rows) d.predictions.push({ ...r, id: randomUUID(), created_at: now() });
      return rows.length;
    });
  }

  private filterPredictions(d: StoreData, f: PredictionFilter) {
    return d.predictions.filter(
      (p) => p.is_demo === isDemo(f.dataset) && (!f.kind || p.kind === f.kind) && (!f.modelRunId || p.model_run_id === f.modelRunId),
    );
  }

  async listPredictions(filter: PredictionFilter, opts: { limit: number; offset: number }) {
    const rows = this.filterPredictions(await this.load(), filter).sort((a, b) => (a.prediction_time < b.prediction_time ? 1 : -1));
    return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total: rows.length };
  }

  async allPredictions(filter: PredictionFilter) {
    return this.filterPredictions(await this.load(), filter).sort((a, b) => (a.prediction_time < b.prediction_time ? -1 : 1));
  }

  async pendingPredictions(dataset: Dataset) {
    return (await this.allPredictions({ dataset, kind: "live" })).filter((p) => p.result === "pending");
  }

  async updatePrediction(id: string, patch: Partial<Pick<Prediction, "actual_multiplier" | "result">>) {
    await this.mutate((d) => {
      const p = d.predictions.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
    });
  }

  async deletePredictions(dataset: Dataset) {
    await this.mutate((d) => {
      d.predictions = d.predictions.filter((p) => p.is_demo !== isDemo(dataset));
    });
  }

  async insertModelRun(run: Parameters<Repository["insertModelRun"]>[0]) {
    return this.mutate((d) => {
      const row: ModelRun = { ...run, id: randomUUID(), created_at: now() };
      d.model_runs.push(row);
      return row;
    });
  }

  async listModelRuns(dataset: Dataset, limit: number) {
    return (await this.load()).model_runs
      .filter((r) => r.is_demo === isDemo(dataset))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit);
  }

  async getModelRun(id: string) {
    return (await this.load()).model_runs.find((r) => r.id === id) ?? null;
  }

  async deleteModelRuns(dataset: Dataset) {
    await this.mutate((d) => {
      const gone = new Set(d.model_runs.filter((r) => r.is_demo === isDemo(dataset)).map((r) => r.id));
      d.model_runs = d.model_runs.filter((r) => !gone.has(r.id));
      d.predictions = d.predictions.filter((p) => !p.model_run_id || !gone.has(p.model_run_id));
    });
  }

  async listDataSources() {
    return [...(await this.load()).data_sources];
  }

  async getDataSource(name: string) {
    return (await this.load()).data_sources.find((s) => s.source_name === name) ?? null;
  }

  async upsertDataSource(src: Parameters<Repository["upsertDataSource"]>[0]) {
    return this.mutate((d) => {
      let row = d.data_sources.find((s) => s.source_name === src.source_name);
      if (row) Object.assign(row, src);
      else {
        row = { enabled: true, last_update: null, notes: null, ...src, id: randomUUID(), created_at: now() } as DataSource;
        d.data_sources.push(row);
      }
      return { ...row };
    });
  }

  async updateDataSource(id: string, patch: Partial<Pick<DataSource, "enabled" | "notes" | "last_update">>) {
    await this.mutate((d) => {
      const s = d.data_sources.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });
  }
}
