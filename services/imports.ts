import "server-only";
import { analyseStrict, canonicalRows, sha256Hex, type StrictImportAnalysis } from "@/lib/import/strict";
import { qualityReport } from "@/lib/quality";
import { HttpError } from "@/lib/http";
import type { CollectionMethod, Dataset, ImportBatch } from "@/types";
import { ingestRounds, type IngestResult } from "./ingestion";
import { getRepository } from "./repository";

export interface ImportRequest {
  csv: string;
  fileName?: string;
  dataset: Extract<Dataset, "real" | "test">;
  sourceName: string;
  collectionMethod: CollectionMethod;
  provenanceNotes: string;
  attested: boolean;
  collectedFrom?: string;
  collectedTo?: string;
  /** Import the valid rows even though some rows were rejected / conflicting. Never overrides synthetic markers. */
  acceptIssues: boolean;
}

export type AnalysisSummary = Omit<StrictImportAnalysis, "rows"> & { validRows: number };

export const summarise = (a: StrictImportAnalysis): AnalysisSummary => {
  const { rows, ...rest } = a;
  return {
    ...rest,
    validRows: rows.length,
    errors: rest.errors.slice(0, 500),
    duplicates: rest.duplicates.slice(0, 500),
    conflicts: rest.conflicts.slice(0, 500),
  };
};

/**
 * Production-safe import with provenance. Real data must be attested as
 * genuine, legitimately obtained observations; files carrying synthetic
 * markers are refused as real no matter what.
 */
export async function importBatch(req: ImportRequest): Promise<{ batch: ImportBatch; ingest: IngestResult; analysis: AnalysisSummary }> {
  const analysis = analyseStrict(req.csv, { fileName: req.fileName });

  if (req.dataset === "real") {
    if (!req.attested) throw new HttpError(422, "Real data must be attested as genuine observations obtained through an authorised mechanism.");
    if (req.collectionMethod === "synthetic") throw new HttpError(422, "Synthetic data can never be imported as REAL DATA — use the TEST dataset.");
    if (analysis.syntheticMarkers.length)
      throw new HttpError(422, `Refusing to import as REAL DATA: ${analysis.syntheticMarkers.join("; ")}.`, summarise(analysis));
  }
  if (!analysis.rows.length) throw new HttpError(422, "No valid rows to import.", summarise(analysis));
  // Synthetic markers only matter for REAL data (handled above); row problems matter for every dataset.
  const hasRowIssues = analysis.errors.length > 0 || analysis.conflicts.length > 0;
  if (hasRowIssues && !req.acceptIssues) {
    throw new HttpError(
      422,
      `Import blocked: ${analysis.errors.length} rejected row(s), ${analysis.conflicts.length} conflicting duplicate(s). Fix the file, or explicitly accept importing only the ${analysis.rows.length} valid row(s).`,
      summarise(analysis),
    );
  }

  const repo = getRepository();
  const [fileSha, rowsSha] = await Promise.all([sha256Hex(req.csv), sha256Hex(canonicalRows(analysis.rows))]);
  const batch = await repo.insertImportBatch({
    dataset: req.dataset,
    source_name: req.sourceName,
    collection_method: req.collectionMethod,
    provenance_notes: req.provenanceNotes,
    attested: req.attested,
    file_name: req.fileName?.slice(0, 255) ?? null,
    file_sha256: fileSha,
    rows_sha256: rowsSha,
    total_rows: analysis.totalRows,
    valid_rows: analysis.rows.length,
    rejected_rows: analysis.errors.length + analysis.conflicts.length,
    duplicates_in_file: analysis.duplicates.length,
    already_stored: 0,
    inserted_rows: 0,
    first_round_time: analysis.firstRoundTime,
    last_round_time: analysis.lastRoundTime,
    collected_from: req.collectedFrom ?? null,
    collected_to: req.collectedTo ?? null,
    quality_report: {},
  });

  const ingest = await ingestRounds({
    rows: analysis.rows,
    source: req.sourceName,
    sourceType: req.dataset === "test" ? "test" : req.collectionMethod === "authorized_api" ? "api" : "csv",
    dataset: req.dataset,
    importBatchId: batch.id,
  });
  const quality = qualityReport(analysis.rows, analysis);
  await repo.updateImportBatch(batch.id, {
    already_stored: ingest.alreadyStored,
    inserted_rows: ingest.inserted,
    quality_report: quality as unknown as Record<string, unknown>,
  });
  return { batch: { ...batch, already_stored: ingest.alreadyStored, inserted_rows: ingest.inserted }, ingest, analysis: summarise(analysis) };
}
