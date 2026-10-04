import type { ImportBatch } from "@/types";
import { ProvenanceChip } from "../layout/provenance";

const method: Record<string, string> = {
  official_export: "Official export",
  manual_record: "Manual record",
  authorized_api: "Authorised API",
  synthetic: "Synthetic",
  other: "Other",
};

export function ImportBatches({ batches }: { batches: ImportBatch[] }) {
  if (!batches.length) return <p className="px-6 py-8 text-sm text-ink-3">No import batches recorded for this dataset yet.</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[980px] text-sm tabular">
        <caption className="sr-only">Import batches with provenance</caption>
        <thead className="text-[11px] tracking-[0.1em] text-ink-3 uppercase">
          <tr className="border-b border-line">
            <th className="px-6 py-3 text-left font-medium">Imported</th>
            <th className="px-3 py-3 text-left font-medium">Label</th>
            <th className="px-3 py-3 text-left font-medium">Source · method</th>
            <th className="px-3 py-3 text-right font-medium">Rows read</th>
            <th className="px-3 py-3 text-right font-medium">Inserted</th>
            <th className="px-3 py-3 text-right font-medium">Rejected / dup.</th>
            <th className="px-3 py-3 text-left font-medium">Period covered</th>
            <th className="px-6 py-3 text-left font-medium">Checksum (rows)</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-b border-line/60 align-top">
              <td className="px-6 py-3 whitespace-nowrap text-ink-2">{b.imported_at.replace("T", " ").slice(0, 16)}</td>
              <td className="px-3 py-3">
                <ProvenanceChip dataset={b.dataset} />
                {b.attested && <span className="mt-1 block text-[10px] text-ink-3">attested</span>}
              </td>
              <td className="max-w-[260px] px-3 py-3">
                <span className="text-ink">{b.source_name}</span> <span className="text-ink-3">· {method[b.collection_method]}</span>
                <p className="mt-1 line-clamp-2 text-xs text-ink-3" title={b.provenance_notes}>
                  {b.provenance_notes}
                </p>
              </td>
              <td className="px-3 py-3 text-right text-ink-2">{b.total_rows.toLocaleString("en-US")}</td>
              <td className="px-3 py-3 text-right text-ink">{b.inserted_rows.toLocaleString("en-US")}</td>
              <td className="px-3 py-3 text-right text-ink-3">
                {b.rejected_rows} / {b.duplicates_in_file + b.already_stored}
              </td>
              <td className="px-3 py-3 text-xs whitespace-nowrap text-ink-3">
                {b.first_round_time?.slice(0, 16).replace("T", " ") ?? "—"}
                <br />→ {b.last_round_time?.slice(0, 16).replace("T", " ") ?? "—"}
              </td>
              <td className="px-6 py-3 font-mono text-[10px] text-ink-3" title={`file ${b.file_sha256 ?? "—"}\nrows ${b.rows_sha256 ?? "—"}`}>
                {b.rows_sha256?.slice(0, 16) ?? "—"}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
