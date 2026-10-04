import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/server";
import type { DataSource, Dataset, ImportBatch, ModelRun, Prediction, Round, ValidationRun } from "@/types";
import type { PredictionFilter, Repository, RoundFilter } from "./types";

const PAGE = 1000;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

const toRound = (r: Record<string, unknown>): Round => ({
  id: String(r.id),
  multiplier: Number(r.multiplier),
  round_time: new Date(String(r.round_time)).toISOString(),
  source: String(r.source),
  dataset: r.dataset as Dataset,
  import_batch_id: (r.import_batch_id as string | null) ?? null,
  created_at: new Date(String(r.created_at)).toISOString(),
});

/** PostgREST renders timestamptz as "...+00:00"; the app compares canonical ISO "Z" strings. */
const isoOrNull = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

const TIME_FIELDS = [
  "created_at", "imported_at", "registered_at", "completed_at", "last_update", "first_round_time", "last_round_time",
  "collected_from", "collected_to", "window_start", "window_end",
];
/** Canonicalise every known timestamp column of a row. */
function normTimes<T>(row: T): T {
  if (!row) return row;
  const r = { ...(row as Record<string, unknown>) };
  for (const k of TIME_FIELDS) if (k in r) r[k] = isoOrNull(r[k]);
  return r as T;
}

const toPrediction = (r: Record<string, unknown>): Prediction =>
  ({
    ...r,
    actual_multiplier: r.actual_multiplier === null ? null : Number(r.actual_multiplier),
    prediction_time: new Date(String(r.prediction_time)).toISOString(),
    based_on_round_time: isoOrNull(r.based_on_round_time),
    train_end_round_time: isoOrNull(r.train_end_round_time),
    target_round_time: isoOrNull(r.target_round_time),
    created_at: new Date(String(r.created_at)).toISOString(),
  }) as Prediction;

export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  private get db(): SupabaseClient {
    return getServiceClient();
  }

  private roundsQuery(filter: RoundFilter, count = false) {
    let q = this.db.from("aviator_rounds").select("*", count ? { count: "exact" } : undefined).eq("dataset", filter.dataset);
    if (filter.from) q = q.gte("round_time", filter.from);
    if (filter.to) q = q.lte("round_time", filter.to);
    if (filter.minMultiplier !== undefined) q = q.gte("multiplier", filter.minMultiplier);
    if (filter.maxMultiplier !== undefined) q = q.lte("multiplier", filter.maxMultiplier);
    if (filter.source) q = q.eq("source", filter.source);
    return q;
  }

  async listRounds(filter: RoundFilter, opts: { limit: number; offset: number; order: "asc" | "desc" }) {
    const res = await this.roundsQuery(filter, true)
      .order("round_time", { ascending: opts.order === "asc" })
      .range(opts.offset, opts.offset + opts.limit - 1);
    const rows = check(res) as Record<string, unknown>[];
    return { rows: rows.map(toRound), total: res.count ?? rows.length };
  }

  async allRounds(filter: RoundFilter) {
    const out: Round[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows = check(
        await this.roundsQuery(filter).order("round_time", { ascending: true }).range(offset, offset + PAGE - 1),
      ) as Record<string, unknown>[];
      out.push(...rows.map(toRound));
      if (rows.length < PAGE) return out;
    }
  }

  async latestRounds(dataset: Dataset, n: number) {
    const rows = check(
      await this.db.from("aviator_rounds").select("*").eq("dataset", dataset).order("round_time", { ascending: false }).limit(n),
    ) as Record<string, unknown>[];
    return rows.map(toRound).reverse();
  }

  async countRounds(dataset: Dataset) {
    const res = await this.db.from("aviator_rounds").select("id", { count: "exact", head: true }).eq("dataset", dataset);
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.count ?? 0;
  }

  async existingRoundTimes(dataset: Dataset, times: string[]) {
    const found = new Set<string>();
    for (let i = 0; i < times.length; i += 200) {
      const chunk = times.slice(i, i + 200);
      const rows = check(
        await this.db.from("aviator_rounds").select("round_time").eq("dataset", dataset).in("round_time", chunk),
      ) as { round_time: string }[];
      rows.forEach((r) => found.add(new Date(r.round_time).toISOString()));
    }
    return found;
  }

  async insertRounds(rows: Parameters<Repository["insertRounds"]>[0]) {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE);
      const data = check(
        await this.db.from("aviator_rounds").upsert(chunk, { onConflict: "dataset,round_time", ignoreDuplicates: true }).select("id"),
      ) as unknown[];
      inserted += data.length;
    }
    return inserted;
  }

  async deleteRounds(dataset: Dataset, ids: string[]) {
    const data = check(
      await this.db.from("aviator_rounds").delete().eq("dataset", dataset).in("id", ids).select("id"),
    ) as unknown[];
    return data.length;
  }

  async deleteAllRounds(dataset: Dataset) {
    const res = await this.db.from("aviator_rounds").delete({ count: "exact" }).eq("dataset", dataset);
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.count ?? 0;
  }

  async insertPredictions(rows: Parameters<Repository["insertPredictions"]>[0]) {
    for (let i = 0; i < rows.length; i += PAGE) {
      check(await this.db.from("predictions").insert(rows.slice(i, i + PAGE)));
    }
    return rows.length;
  }

  private predictionsQuery(filter: PredictionFilter, count = false) {
    let q = this.db.from("predictions").select("*", count ? { count: "exact" } : undefined).eq("dataset", filter.dataset);
    if (filter.kind) q = q.eq("kind", filter.kind);
    if (filter.modelRunId) q = q.eq("model_run_id", filter.modelRunId);
    if (filter.validationRunId) q = q.eq("validation_run_id", filter.validationRunId);
    return q;
  }

  async listPredictions(filter: PredictionFilter, opts: { limit: number; offset: number }) {
    const res = await this.predictionsQuery(filter, true)
      .order("prediction_time", { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1);
    const rows = check(res) as Record<string, unknown>[];
    return { rows: rows.map(toPrediction), total: res.count ?? rows.length };
  }

  async allPredictions(filter: PredictionFilter) {
    const out: Prediction[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows = check(
        await this.predictionsQuery(filter).order("prediction_time", { ascending: true }).range(offset, offset + PAGE - 1),
      ) as Record<string, unknown>[];
      out.push(...rows.map(toPrediction));
      if (rows.length < PAGE) return out;
    }
  }

  async pendingPredictions(dataset: Dataset) {
    const rows = check(
      await this.db
        .from("predictions")
        .select("*")
        .eq("dataset", dataset)
        .eq("kind", "live")
        .eq("result", "pending")
        .order("prediction_time", { ascending: true })
        .limit(500),
    ) as Record<string, unknown>[];
    return rows.map(toPrediction);
  }

  async getPrediction(id: string) {
    const row = check(await this.db.from("predictions").select("*").eq("id", id).maybeSingle()) as Record<string, unknown> | null;
    return row ? toPrediction(row) : null;
  }

  async updatePrediction(id: string, patch: Partial<Pick<Prediction, "actual_multiplier" | "result" | "target_round_time">>) {
    check(await this.db.from("predictions").update(patch).eq("id", id));
  }

  async deletePredictions(dataset: Dataset) {
    check(await this.db.from("predictions").delete().eq("dataset", dataset));
  }

  async insertModelRun(run: Parameters<Repository["insertModelRun"]>[0]) {
    return normTimes(check(await this.db.from("model_runs").insert(run).select("*").single()) as ModelRun);
  }

  async listModelRuns(dataset: Dataset, limit: number) {
    return (
      check(
        await this.db.from("model_runs").select("*").eq("dataset", dataset).order("created_at", { ascending: false }).limit(limit),
      ) as ModelRun[]
    ).map(normTimes);
  }

  async getModelRun(id: string) {
    const res = await this.db.from("model_runs").select("*").eq("id", id).maybeSingle();
    return normTimes(check(res) as ModelRun | null);
  }

  async deleteModelRuns(dataset: Dataset) {
    check(await this.db.from("model_runs").delete().eq("dataset", dataset));
  }

  async listDataSources() {
    return (check(await this.db.from("data_sources").select("*").order("created_at")) as DataSource[]).map(normTimes);
  }

  async getDataSource(name: string) {
    return normTimes(check(await this.db.from("data_sources").select("*").eq("source_name", name).maybeSingle()) as DataSource | null);
  }

  async upsertDataSource(src: Parameters<Repository["upsertDataSource"]>[0]) {
    return normTimes(check(await this.db.from("data_sources").upsert(src, { onConflict: "source_name" }).select("*").single()) as DataSource);
  }

  async updateDataSource(id: string, patch: Partial<Pick<DataSource, "enabled" | "notes" | "last_update">>) {
    check(await this.db.from("data_sources").update(patch).eq("id", id));
  }

  async insertImportBatch(b: Parameters<Repository["insertImportBatch"]>[0]) {
    return normTimes(check(await this.db.from("import_batches").insert(b).select("*").single()) as ImportBatch);
  }

  async updateImportBatch(id: string, patch: Parameters<Repository["updateImportBatch"]>[1]) {
    check(await this.db.from("import_batches").update(patch).eq("id", id));
  }

  async listImportBatches(dataset: Dataset) {
    return (
      check(
        await this.db.from("import_batches").select("*").eq("dataset", dataset).order("imported_at", { ascending: false }).limit(200),
      ) as ImportBatch[]
    ).map(normTimes);
  }

  async deleteImportBatches(dataset: Dataset) {
    check(await this.db.from("import_batches").delete().eq("dataset", dataset));
  }

  async insertValidationRun(r: Parameters<Repository["insertValidationRun"]>[0]) {
    const res = await this.db.from("validation_runs").insert(r).select("*").single();
    if (res.error?.code === "23505") throw new Error("ALREADY_EVALUATED");
    return normTimes(check(res) as ValidationRun);
  }

  async updateValidationRun(id: string, patch: Parameters<Repository["updateValidationRun"]>[1]) {
    check(await this.db.from("validation_runs").update(patch).eq("id", id));
  }

  async listValidationRuns(dataset: Dataset) {
    return (
      check(await this.db.from("validation_runs").select("*").eq("dataset", dataset).order("registered_at", { ascending: false })) as ValidationRun[]
    ).map(normTimes);
  }

  async getValidationRun(id: string) {
    return normTimes(check(await this.db.from("validation_runs").select("*").eq("id", id).maybeSingle()) as ValidationRun | null);
  }
}
