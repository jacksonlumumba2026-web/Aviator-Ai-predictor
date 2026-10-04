import { NextResponse, type NextRequest } from "next/server";
import { MAX_CSV_BYTES } from "@/lib/csv";
import { guard, handler, parseJson } from "@/lib/http";
import { importRequestSchema } from "@/lib/schemas";
import { importBatch } from "@/services/imports";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Strict, provenance-recording CSV import into the REAL or TEST dataset. */
export const POST = handler(async (req: NextRequest) => {
  await guard(req, { bucket: "import", limit: 10, admin: true });
  const body = await parseJson(req, importRequestSchema, MAX_CSV_BYTES + 20_000);
  const out = await importBatch({
    csv: body.csv,
    fileName: body.file_name,
    dataset: body.dataset,
    sourceName: body.source_name,
    collectionMethod: body.collection_method,
    provenanceNotes: body.provenance_notes,
    attested: body.attested,
    collectedFrom: body.collected_from,
    collectedTo: body.collected_to,
    acceptIssues: body.accept_issues,
  });
  return NextResponse.json(out, { status: 201 });
});
