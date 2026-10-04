import "server-only";
import { env } from "@/lib/env";
import type { Dataset, SourceType } from "@/types";
import { generateNextEstimate, resolvePendingPredictions } from "./prediction";
import { getRepository } from "./repository";

export interface IngestResult {
  received: number;
  inserted: number;
  alreadyStored: number;
  resolvedPredictions: number;
  newEstimate: boolean;
}

/**
 * Single entry point for every ingestion path (manual, CSV, authorised live
 * feed, demo). Rows must already be validated and normalised.
 */
export async function ingestRounds(input: {
  rows: { multiplier: number; round_time: string }[];
  source: string;
  sourceType: SourceType;
  dataset: Dataset;
  autoPredict?: boolean;
}): Promise<IngestResult> {
  const repo = getRepository();
  const existing = await repo.existingRoundTimes(input.dataset, input.rows.map((r) => r.round_time));
  const fresh = input.rows.filter((r) => !existing.has(r.round_time));
  const inserted = fresh.length
    ? await repo.insertRounds(
        fresh.map((r) => ({ multiplier: r.multiplier, round_time: r.round_time, source: input.source, is_demo: input.dataset === "demo" })),
      )
    : 0;

  const src = await repo.getDataSource(input.source);
  if (src) await repo.updateDataSource(src.id, { last_update: new Date().toISOString() });
  else await repo.upsertDataSource({ source_name: input.source, source_type: input.sourceType, last_update: new Date().toISOString() });

  let resolvedPredictions = 0;
  let newEstimate = false;
  if (inserted > 0) {
    resolvedPredictions = await resolvePendingPredictions(input.dataset);
    if (input.autoPredict ?? env.autoPredict) {
      try {
        const [run] = await repo.listModelRuns(input.dataset, 1);
        if (run) {
          newEstimate = (await generateNextEstimate(input.dataset)).created;
        }
      } catch (err) {
        console.warn("[ingest] auto-estimate skipped:", err instanceof Error ? err.message : err);
      }
    }
  }
  return { received: input.rows.length, inserted, alreadyStored: input.rows.length - fresh.length, resolvedPredictions, newEstimate };
}
