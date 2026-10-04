import { NextResponse, type NextRequest } from "next/server";
import { MAX_CSV_BYTES, parseRoundsCsv } from "@/lib/csv";
import { guard, handler, parseJson } from "@/lib/http";
import { csvImportSchema } from "@/lib/schemas";
import { ingestRounds } from "@/services/ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CSV import into the REAL dataset. Demo data is loaded separately via /api/demo. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "import", limit: 10, admin: true });
  const { csv, source } = await parseJson(req, csvImportSchema, MAX_CSV_BYTES + 10_000);
  const parsed = parseRoundsCsv(csv);
  const future = parsed.rows.filter((r) => Date.parse(r.round_time) > Date.now() + 60_000);
  const rows = parsed.rows.filter((r) => !future.includes(r));
  const errors = [
    ...parsed.errors,
    ...future.map((r) => ({ line: r.line, raw: "", reason: "round_time is in the future" })),
  ].sort((a, b) => a.line - b.line);

  const result = rows.length
    ? await ingestRounds({ rows, source, sourceType: "csv", dataset: "real" })
    : { received: 0, inserted: 0, alreadyStored: 0, resolvedPredictions: 0, newEstimate: false };

  return NextResponse.json({
    ...result,
    totalRows: parsed.totalRows,
    valid: rows.length,
    errors: errors.slice(0, 500),
    errorCount: errors.length,
    duplicatesInFile: parsed.duplicates.slice(0, 500),
    duplicatesInFileCount: parsed.duplicates.length,
    warnings: parsed.warnings,
  });
});
