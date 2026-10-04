/**
 * Data-pipeline integration tests against real Postgres + PostgREST via the
 * app's own SupabaseRepository and ingestion service.
 * Run: scripts/local-supabase.sh start && npm run test:integration
 */
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { parseRoundsCsv } from "@/lib/csv";

const jwt = (role: string) => execSync(`node scripts/local-jwt.mjs ${role}`).toString();
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || jwt("service_role");
process.env.ML_SERVICE_URL = "";

// These tests DELETE all rows. Refuse to run against anything but a local stack.
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (!["127.0.0.1", "localhost"].includes(host) || process.env.AAL_INTEGRATION_DB !== "disposable") {
  throw new Error(
    `Refusing to run destructive integration tests against ${host}. Use scripts/local-supabase.sh and set AAL_INTEGRATION_DB=disposable.`,
  );
}

type Mods = {
  repo: import("@/services/repository/types").Repository;
  ingest: typeof import("@/services/ingestion").ingestRounds;
  db: import("@supabase/supabase-js").SupabaseClient;
};
let m: Mods;

async function reset() {
  for (const t of ["predictions", "model_runs", "aviator_rounds", "validation_runs", "import_batches"]) {
    const col = t === "import_batches" ? "imported_at" : t === "validation_runs" ? "registered_at" : "created_at";
    const { error } = await m.db.from(t).delete().not(col, "is", null);
    if (error) throw new Error(error.message);
  }
}

function csvFor(n: number, startMs: number, stepS = 15, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lines = ["multiplier,round_time"];
  for (let i = 0; i < n; i++) {
    const m = Math.min(10_000, Math.max(1, Math.floor(97 / (1 - rnd())) / 100));
    lines.push(`${m.toFixed(2)},${new Date(startMs + i * stepS * 1000).toISOString()}`);
  }
  return lines.join("\n");
}

beforeAll(async () => {
  const { SupabaseRepository } = await import("@/services/repository/supabase");
  const { ingestRounds } = await import("@/services/ingestion");
  const { getServiceClient } = await import("@/lib/supabase/server");
  m = { repo: new SupabaseRepository(), ingest: ingestRounds, db: getServiceClient() };
  await reset();
});

describe("CSV import → Supabase", () => {
  it("stores valid rows, rejects invalid ones, sorts chronologically", async () => {
    await reset();
    const csv = [
      "multiplier,round_time",
      "2.31,2026-10-04T10:00:18Z",
      "1.24,2026-10-04T10:00:01Z", // out of order
      "0.99,2026-10-04T10:00:20Z", // < 1
      "abc,2026-10-04T10:00:21Z", // malformed
      "1.05,2026-10-04T10:00:36Z",
      "2.31,2026-10-04T10:00:18+00:00", // duplicate within file (same instant)
      "7.777,2026-10-04T10:00:50Z", // rounded to 2 dp
    ].join("\n");
    const parsed = parseRoundsCsv(csv);
    expect(parsed.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(parsed.duplicates.map((e) => e.line)).toEqual([7]);
    const res = await m.ingest({ rows: parsed.rows, source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    expect(res.inserted).toBe(4);
    const stored = await m.repo.allRounds({ dataset: "real" });
    expect(stored.map((r) => [r.multiplier, r.round_time])).toEqual([
      [1.24, "2026-10-04T10:00:01.000Z"],
      [2.31, "2026-10-04T10:00:18.000Z"],
      [1.05, "2026-10-04T10:00:36.000Z"],
      [7.78, "2026-10-04T10:00:50.000Z"],
    ]);
    expect(stored.every((r) => r.source === "csv_import" && r.dataset === "real")).toBe(true);
    expect(typeof stored[0].multiplier).toBe("number");
  });

  it("detects duplicates against the database on re-import (and mixed batches)", async () => {
    const before = await m.repo.countRounds("real");
    const again = parseRoundsCsv("multiplier,round_time\n1.24,2026-10-04T10:00:01Z\n9.00,2026-10-04T11:00:00Z\n");
    const res = await m.ingest({ rows: again.rows, source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    expect(res).toMatchObject({ received: 2, inserted: 1, alreadyStored: 1 });
    expect(await m.repo.countRounds("real")).toBe(before + 1);
  });

  it("enforces the database constraints even if app validation were bypassed", async () => {
    const { error } = await m.db.from("aviator_rounds").insert({ multiplier: 0.5, round_time: "2026-01-01T00:00:00Z" });
    expect(error?.code).toBe("23514");
    const dup = await m.db.from("aviator_rounds").insert({ multiplier: 2, round_time: "2026-10-04T10:00:01Z", dataset: "real" });
    expect(dup.error?.code).toBe("23505");
  });

  it("keeps demo and real datasets separate", async () => {
    await m.ingest({ rows: [{ multiplier: 3, round_time: "2026-10-04T10:00:01.000Z" }], source: "demo", sourceType: "demo", dataset: "demo", autoPredict: false });
    const demo = await m.repo.allRounds({ dataset: "demo" });
    const real = await m.repo.allRounds({ dataset: "real" });
    expect(demo).toHaveLength(1);
    expect(demo[0].dataset).toBe("demo");
    expect(real.find((r) => r.round_time === "2026-10-04T10:00:01.000Z")!.multiplier).toBe(1.24);
  });
});

describe("large imports beyond PostgREST page size", () => {
  it("stores and retrieves 2,500 rows completely and in order", async () => {
    await reset();
    const parsed = parseRoundsCsv(csvFor(2500, Date.parse("2026-09-01T00:00:00Z")));
    expect(parsed.rows).toHaveLength(2500);
    const res = await m.ingest({ rows: parsed.rows, source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    expect(res.inserted).toBe(2500);
    const stored = await m.repo.allRounds({ dataset: "real" });
    expect(stored).toHaveLength(2500);
    expect(stored.map((r) => r.round_time)).toEqual(parsed.rows.map((r) => r.round_time));
    expect(stored.map((r) => r.multiplier)).toEqual(parsed.rows.map((r) => r.multiplier));
    const re = await m.ingest({ rows: parsed.rows, source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    expect(re).toMatchObject({ inserted: 0, alreadyStored: 2500 });
  });

  it("filters, paginates and deletes", async () => {
    const page = await m.repo.listRounds({ dataset: "real", minMultiplier: 2 }, { limit: 10, offset: 0, order: "desc" });
    const all = await m.repo.allRounds({ dataset: "real" });
    expect(page.total).toBe(all.filter((r) => r.multiplier >= 2).length);
    expect(page.rows.every((r) => r.multiplier >= 2)).toBe(true);
    expect(page.rows[0].round_time > page.rows[1].round_time).toBe(true);
    const win = await m.repo.listRounds(
      { dataset: "real", from: all[100].round_time, to: all[199].round_time },
      { limit: 500, offset: 0, order: "asc" },
    );
    expect(win.total).toBe(100);
    const latest = await m.repo.latestRounds("real", 5);
    expect(latest.map((r) => r.id)).toEqual(all.slice(-5).map((r) => r.id));
    expect(await m.repo.deleteRounds("real", [all[0].id, all[1].id])).toBe(2);
    expect(await m.repo.countRounds("real")).toBe(2498);
  });
});

describe("predictions and model runs", () => {
  it("round-trips a model run report and prediction rows", async () => {
    const run = await m.repo.insertModelRun({
      model_version: "v20261004000000-abcdef",
      dataset: "real",
      training_samples: 10,
      validation_samples: 2,
      test_samples: 3,
      accuracy: 0.5,
      precision: 0.4,
      recall: 0.3,
      roc_auc: 0.51,
      brier_score: 0.25,
      baseline_accuracy: 0.52,
      verdict: "no_edge",
      confidence: "LOW",
      report: { splits: { train: 10 }, selection: {}, metrics: { "2x": { n: 3 } }, feature_names: ["lag_log_1"] },
    });
    expect(run.id).toBeTruthy();
    expect((await m.repo.getModelRun(run.id))!.report.feature_names).toEqual(["lag_log_1"]);
    await m.repo.insertPredictions([
      {
        prediction_time: "2026-10-04T12:00:00.000Z",
        model_version: run.model_version,
        model_run_id: run.id,
        kind: "live",
        dataset: "real",
        based_on_round_time: "2026-10-04T11:59:45.000Z",
        probability_1_5x: 0.6,
        probability_2x: 0.45,
        probability_3x: 0.3,
        probability_5x: 0.18,
        probability_10x: 0.09,
        baseline: { "2x": 0.48 },
        features: { lag_log_1: 0.1 },
        train_end_round_time: "2026-10-04T11:59:45.000Z",
        confidence: "LOW",
        predicted_class: ">=1.5x",
        actual_multiplier: null,
        result: "pending",
      },
    ]);
    const [p] = await m.repo.pendingPredictions("real");
    expect(p.features).toEqual({ lag_log_1: 0.1 });
    expect(p.prediction_time).toBe("2026-10-04T12:00:00.000Z");
    await m.repo.updatePrediction(p.id, { actual_multiplier: 2.5, result: "incorrect" });
    const { rows } = await m.repo.listPredictions({ dataset: "real", kind: "live" }, { limit: 5, offset: 0 });
    expect(rows[0]).toMatchObject({ actual_multiplier: 2.5, result: "incorrect" });
    expect(await m.repo.pendingPredictions("real")).toHaveLength(0);
  });
});

describe("live estimate resolution on Supabase (timestamp format regression)", () => {
  it("normalises timestamptz so an estimate is never resolved against its own input round", async () => {
    await reset();
    const rows = [
      { multiplier: 1.1, round_time: "2026-10-04T10:00:01.000Z" },
      { multiplier: 1.2, round_time: "2026-10-04T10:00:16.000Z" },
    ];
    await m.ingest({ rows, source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    await m.repo.insertPredictions([
      {
        prediction_time: "2026-10-04T10:00:17.000Z",
        model_version: "v20261004000000-abcdef",
        model_run_id: null,
        kind: "live",
        dataset: "real",
        based_on_round_time: "2026-10-04T10:00:16.000Z",
        probability_1_5x: 0.6, probability_2x: 0.6, probability_3x: 0.3, probability_5x: 0.2, probability_10x: 0.1,
        baseline: { "2x": 0.48 }, features: { lag_log_1: 0.18 }, train_end_round_time: "2026-10-04T10:00:16.000Z", target_round_time: null,
        confidence: "LOW", predicted_class: ">=2x", actual_multiplier: null, result: "pending",
      },
    ]);
    const [p] = await m.repo.pendingPredictions("real");
    expect(p.based_on_round_time).toBe("2026-10-04T10:00:16.000Z");
    const { resolvePendingPredictions } = await import("@/services/prediction");
    expect(await resolvePendingPredictions("real")).toBe(0); // no newer round yet
    await m.ingest({ rows: [{ multiplier: 3.4, round_time: "2026-10-04T10:00:31.000Z" }], source: "csv_import", sourceType: "csv", dataset: "real", autoPredict: false });
    const [done] = (await m.repo.listPredictions({ dataset: "real", kind: "live" }, { limit: 1, offset: 0 })).rows;
    expect(done).toMatchObject({ actual_multiplier: 3.4, result: "correct", target_round_time: "2026-10-04T10:00:31.000Z" });
  });

  it("rejects a prediction whose model was trained on its own target (DB constraint)", async () => {
    const { error } = await m.db.from("predictions").insert({
      prediction_time: "2026-10-04T10:00:31Z", model_version: "x", kind: "backtest", dataset: "real",
      probability_1_5x: 0.5, probability_2x: 0.5, probability_3x: 0.3, probability_5x: 0.2, probability_10x: 0.1,
      confidence: "LOW", predicted_class: "<1.5x",
      target_round_time: "2026-10-04T10:00:31Z", train_end_round_time: "2026-10-04T10:00:31Z",
    });
    expect(error?.code).toBe("23514");
  });
});


describe("provenance-safe import (import batches)", () => {
  const good = "multiplier,round_time\n1.24,2026-10-04T13:00:01+03:00\n2.31,2026-10-04T10:00:18Z\n1.05,2026-10-04T10:00:36Z\n";
  const base = {
    sourceName: "my_exported_history",
    collectionMethod: "official_export" as const,
    provenanceNotes: "Exported from my own account history page on 2026-10-04.",
    acceptIssues: false,
  };

  it("records a batch with provenance, checksums and a quality report", async () => {
    await reset();
    const { importBatch } = await import("@/services/imports");
    const out = await importBatch({ ...base, csv: good, fileName: "history.csv", dataset: "real", attested: true });
    expect(out.ingest.inserted).toBe(3);
    const [b] = await m.repo.listImportBatches("real");
    expect(b).toMatchObject({
      dataset: "real", source_name: "my_exported_history", collection_method: "official_export", attested: true,
      total_rows: 3, valid_rows: 3, inserted_rows: 3, file_name: "history.csv",
      first_round_time: "2026-10-04T10:00:01.000Z", last_round_time: "2026-10-04T10:00:36.000Z",
    });
    expect(b.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.rows_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((b.quality_report as { uniqueRounds: number }).uniqueRounds).toBe(3);
    const rounds = await m.repo.allRounds({ dataset: "real" });
    expect(rounds.every((r) => r.import_batch_id === b.id)).toBe(true);
  });

  it("refuses unattested, synthetic, or synthetic-marked files as REAL DATA", async () => {
    const { importBatch } = await import("@/services/imports");
    await expect(importBatch({ ...base, csv: good, dataset: "real", attested: false })).rejects.toThrow(/attested/);
    await expect(importBatch({ ...base, csv: good, dataset: "real", attested: true, collectionMethod: "synthetic" })).rejects.toThrow(/Synthetic/);
    await expect(importBatch({ ...base, csv: "# DEMO DATA — NOT REAL GAME RESULTS\n" + good, dataset: "real", attested: true })).rejects.toThrow(/Refusing/);
    // ...and the database itself refuses an unattested real batch.
    const { error } = await m.db.from("import_batches").insert({ dataset: "real", source_name: "x", collection_method: "synthetic", provenance_notes: "0123456789", attested: true });
    expect(error?.code).toBe("23514");
  });

  it("blocks dirty files unless issues are explicitly accepted", async () => {
    const { importBatch } = await import("@/services/imports");
    const dirty = good + "0.5,2026-10-04T10:01:00Z\n";
    await expect(importBatch({ ...base, csv: dirty, dataset: "real", attested: true })).rejects.toThrow(/Import blocked/);
    const ok = await importBatch({ ...base, csv: dirty, dataset: "real", attested: true, acceptIssues: true });
    expect(ok.ingest).toMatchObject({ inserted: 0, alreadyStored: 3 });
    expect(ok.analysis.errors).toHaveLength(1);
  });

  it("accepts a TEST DATA banner for the test dataset (regression)", async () => {
    const { importBatch } = await import("@/services/imports");
    const banner = "# TEST DATA — synthetic\nmultiplier,round_time\n1.50,2026-10-04T11:00:00Z\n";
    const out = await importBatch({ ...base, csv: banner, dataset: "test", attested: false, collectionMethod: "synthetic" });
    expect(out.ingest.inserted).toBe(1);
  });

  it("imports synthetic data only as TEST DATA, kept separate", async () => {
    const { importBatch } = await import("@/services/imports");
    const out = await importBatch({ ...base, csv: good, dataset: "test", attested: false, collectionMethod: "synthetic" });
    expect(out.ingest.inserted).toBe(3);
    expect(await m.repo.countRounds("test")).toBe(4);
    expect((await m.repo.allRounds({ dataset: "test" }))[0].dataset).toBe("test");
  });
});
