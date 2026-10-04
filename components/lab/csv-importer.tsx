"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Info } from "lucide-react";
import { MAX_CSV_BYTES, parseRoundsCsv, type CsvIssue } from "@/lib/csv";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

interface ImportResponse {
  inserted: number;
  alreadyStored: number;
  totalRows: number;
  valid: number;
  errorCount: number;
  errors: CsvIssue[];
  duplicatesInFileCount: number;
  duplicatesInFile: CsvIssue[];
  warnings: string[];
  resolvedPredictions: number;
}

function IssueTable({ issues, title }: { issues: CsvIssue[]; title: string }) {
  if (!issues.length) return null;
  return (
    <details className="group rounded-xl border border-line bg-white/[0.015]" open={issues.length <= 8}>
      <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-ink-2">
        {title} ({issues.length.toLocaleString("en-US")}
        {issues.length >= 500 ? "+" : ""})
      </summary>
      <div className="max-h-64 overflow-auto border-t border-line scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-ink-3">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Line</th>
              <th className="px-4 py-2 text-left font-medium">Problem</th>
              <th className="px-4 py-2 text-left font-medium">Row</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, 200).map((e, i) => (
              <tr key={`${e.line}-${i}`} className="border-t border-line/60">
                <td className="px-4 py-1.5 text-ink-2 tabular">{e.line}</td>
                <td className="px-4 py-1.5 text-bad-ink">{e.reason}</td>
                <td className="max-w-[240px] truncate px-4 py-1.5 font-mono text-ink-3">{e.raw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function CsvImporter({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [source, setSource] = useState("csv_import");
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const preview = useMemo(() => (file ? parseRoundsCsv(file.text) : null), [file]);

  async function load(f: File | undefined) {
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size > MAX_CSV_BYTES) {
      setError(`File is larger than ${MAX_CSV_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFile({ name: f.name, text: await f.text() });
  }

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rounds/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: file.text, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          load(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition",
          drag ? "border-brand bg-brand/[0.06]" : "border-line-strong bg-white/[0.015] hover:border-brand/50 hover:bg-white/[0.03]",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl border border-line-strong bg-white/[0.04]">
          <FileUp className="size-5 text-brand" aria-hidden />
        </span>
        <span className="mt-4 text-sm font-medium text-ink">{file ? file.name : "Drop a CSV here or click to browse"}</span>
        <span className="mt-1 text-xs text-ink-3">
          Columns: <code className="font-mono">multiplier,round_time</code> · ISO-8601 timestamps · max 8 MB
        </span>
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />

      {preview && !result && (
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Valid rows", preview.rows.length, "text-ink"],
            ["Rejected", preview.errors.length, preview.errors.length ? "text-bad-ink" : "text-ink-3"],
            ["Duplicates in file", preview.duplicates.length, preview.duplicates.length ? "text-warn" : "text-ink-3"],
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl border border-line bg-white/[0.015] p-3">
              <p className={cn("text-xl font-semibold tabular", c as string)}>{(v as number).toLocaleString("en-US")}</p>
              <p className="text-[11px] text-ink-3">{l}</p>
            </div>
          ))}
        </div>
      )}
      {preview && !result && <IssueTable issues={preview.errors} title="Rows that will be rejected" />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-ink-3">
          Source label
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={64}
            pattern="[a-zA-Z0-9_.\-]+"
            className="mt-1.5 block h-10 w-full rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <Button variant="primary" onClick={submit} loading={loading} disabled={!preview?.rows.length || disabled}>
          Import {preview?.rows.length ? preview.rows.length.toLocaleString("en-US") : ""} rounds
        </Button>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-bad-ink">
          <AlertCircle className="size-4" /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-3" role="status">
          <div className="flex items-start gap-3 rounded-xl border border-good/40 bg-good/[0.07] p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good-ink" />
            <div className="text-ink-2">
              <p className="font-semibold text-ink">{result.inserted.toLocaleString("en-US")} new rounds imported.</p>
              <p className="mt-1 text-xs">
                {result.totalRows.toLocaleString("en-US")} rows read · {result.errorCount} rejected · {result.duplicatesInFileCount} duplicate(s) within the
                file · {result.alreadyStored} already stored (skipped)
                {result.resolvedPredictions ? ` · ${result.resolvedPredictions} pending estimate(s) scored` : ""}
              </p>
            </div>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="flex items-center gap-2 text-xs text-warn">
              <Info className="size-3.5" /> {w}
            </p>
          ))}
          <IssueTable issues={result.errors} title="Rejected rows" />
          <IssueTable issues={result.duplicatesInFile} title="Duplicate rows in file" />
        </div>
      )}
    </div>
  );
}
