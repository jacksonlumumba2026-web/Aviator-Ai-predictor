"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, FileUp, Info, ShieldCheck } from "lucide-react";
import { MAX_CSV_BYTES, type CsvIssue } from "@/lib/csv";
import { analyseStrict } from "@/lib/import/strict";
import type { CollectionMethod } from "@/types";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

const field = "mt-1.5 block h-10 w-full rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand [color-scheme:dark]";

const METHODS: { v: CollectionMethod; label: string; realOk: boolean }[] = [
  { v: "official_export", label: "Official history export", realOk: true },
  { v: "manual_record", label: "Own manual record", realOk: true },
  { v: "authorized_api", label: "Authorised API / feed", realOk: true },
  { v: "other", label: "Other (describe below)", realOk: true },
  { v: "synthetic", label: "Synthetic / generated (TEST only)", realOk: false },
];

interface ImportResponse {
  batch: { id: string; inserted_rows: number; already_stored: number; file_sha256: string; rows_sha256: string };
  analysis: { validRows: number; totalRows: number; errors: CsvIssue[]; duplicates: CsvIssue[]; conflicts: CsvIssue[]; warnings: string[] };
}

function IssueTable({ issues, title, tone = "text-bad-ink" }: { issues: CsvIssue[]; title: string; tone?: string }) {
  if (!issues.length) return null;
  return (
    <details className="rounded-xl border border-line bg-white/[0.015]" open={issues.length <= 8}>
      <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-ink-2">
        {title} ({issues.length.toLocaleString("en-US")})
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
                <td className={cn("px-4 py-1.5", tone)}>{e.reason}</td>
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
  const [dataset, setDataset] = useState<"real" | "test">("real");
  const [source, setSource] = useState("");
  const [method, setMethod] = useState<CollectionMethod>("official_export");
  const [notes, setNotes] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [attested, setAttested] = useState(false);
  const [acceptIssues, setAcceptIssues] = useState(false);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const a = useMemo(() => (file ? analyseStrict(file.text, { fileName: file.name }) : null), [file]);
  const realBlocked = dataset === "real" && (!!a?.syntheticMarkers.length || method === "synthetic");
  const formOk = source.trim().length > 0 && notes.trim().length >= 10 && (dataset !== "real" || attested);
  const canImport = !!a?.rows.length && formOk && !realBlocked && (a.clean || acceptIssues) && !disabled;

  async function load(f: File | undefined) {
    setResult(null);
    setError(null);
    setAcceptIssues(false);
    if (!f) return;
    if (f.size > MAX_CSV_BYTES) return setError(`File is larger than ${MAX_CSV_BYTES / 1024 / 1024} MB.`);
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
        body: JSON.stringify({
          csv: file.text,
          file_name: file.name,
          dataset,
          source_name: source.trim(),
          collection_method: method,
          provenance_notes: notes.trim(),
          attested: dataset === "real" ? attested : false,
          collected_from: from ? new Date(from).toISOString() : undefined,
          collected_to: to ? new Date(to).toISOString() : undefined,
          accept_issues: acceptIssues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error + (Array.isArray(data.details) ? `: ${data.details.map((d: { message: string }) => d.message).join(", ")}` : ""));
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
      {/* 1. Dataset label */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Import as">
        {(["real", "test"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dataset === d}
            onClick={() => {
              setDataset(d);
              if (d === "real" && method === "synthetic") setMethod("official_export");
            }}
            className={cn(
              "rounded-xl border p-3 text-left transition",
              dataset === d
                ? d === "real"
                  ? "border-series-1/50 bg-series-1/10"
                  : "border-[#b48cff]/50 bg-[#b48cff]/10"
                : "border-line hover:border-line-strong",
            )}
          >
            <span className="block text-xs font-bold tracking-[0.14em] text-ink">{d === "real" ? "REAL DATA" : "TEST DATA"}</span>
            <span className="mt-0.5 block text-[11px] text-ink-3">
              {d === "real" ? "Genuine observations you are permitted to use" : "Synthetic / fixture data for testing the pipeline"}
            </span>
          </button>
        ))}
      </div>

      {/* 2. File */}
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
          "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition",
          drag ? "border-brand bg-brand/[0.06]" : "border-line-strong bg-white/[0.015] hover:border-brand/50 hover:bg-white/[0.03]",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl border border-line-strong bg-white/[0.04]">
          <FileUp className="size-5 text-brand" aria-hidden />
        </span>
        <span className="mt-4 text-sm font-medium text-ink">{file ? file.name : "Drop a CSV here or click to browse"}</span>
        <span className="mt-1 text-xs text-ink-3">
          <code className="font-mono">multiplier,round_time</code> · ISO-8601 with seconds and timezone · max 8 MB
        </span>
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />

      {/* 3. Validation preview */}
      {a && !result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ["Valid rows", a.rows.length, "text-ink"],
              ["Rejected", a.errors.length, a.errors.length ? "text-bad-ink" : "text-ink-3"],
              ["Duplicates", a.duplicates.length, a.duplicates.length ? "text-warn" : "text-ink-3"],
              ["Conflicts", a.conflicts.length, a.conflicts.length ? "text-bad-ink" : "text-ink-3"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl border border-line bg-white/[0.015] p-3">
                <p className={cn("text-xl font-semibold tabular", c as string)}>{(v as number).toLocaleString("en-US")}</p>
                <p className="text-[11px] text-ink-3">{l}</p>
              </div>
            ))}
          </div>
          {a.firstRoundTime && (
            <p className="text-xs text-ink-3">
              {a.firstRoundTime.replace("T", " ").slice(0, 19)} → {a.lastRoundTime!.replace("T", " ").slice(0, 19)} UTC
              {a.timeGaps.medianIntervalS !== null && ` · median interval ${a.timeGaps.medianIntervalS.toFixed(1)} s`}
            </p>
          )}
          {a.syntheticMarkers.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/[0.07] p-3 text-xs text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              This file looks synthetic ({a.syntheticMarkers.join("; ")}). It can only be imported as TEST DATA.
            </p>
          )}
          {a.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-xs text-warn">
              <Info className="mt-0.5 size-3.5 shrink-0" /> {w}
            </p>
          ))}
          <IssueTable issues={a.errors} title="Rejected rows" />
          <IssueTable issues={a.conflicts} title="Conflicting duplicates (dropped — neither value is trusted)" />
          <IssueTable issues={a.duplicates} title="Exact duplicates (skipped)" tone="text-warn" />
        </div>
      )}

      {/* 4. Provenance */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-ink-3">
          Source name
          <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={64} placeholder="e.g. my_betika_history_export" className={field} />
        </label>
        <label className="text-xs text-ink-3">
          Collection method
          <select value={method} onChange={(e) => setMethod(e.target.value as CollectionMethod)} className={field}>
            {METHODS.filter((m) => dataset === "test" || m.realOk).map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-3 sm:col-span-2">
          Provenance — where, how and under what permission the data was obtained
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. Downloaded from my own account's game-history page on 2026-10-04; personal use permitted by the site's terms."
            className={cn(field, "h-auto py-2")}
          />
        </label>
        <label className="text-xs text-ink-3">
          Collected from (optional)
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-ink-3">
          Collected to (optional)
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
      </div>

      {dataset === "real" && (
        <label className="flex items-start gap-3 rounded-xl border border-series-1/30 bg-series-1/[0.05] p-4 text-sm text-ink-2">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1 accent-[#3987e5]" />
          <span>
            <ShieldCheck className="mr-1 inline size-4 text-[#9ec5f4]" />I confirm these are <strong className="text-ink">genuine game observations</strong>{" "}
            obtained through an authorised or permitted mechanism — not synthetic, simulated, scraped from private endpoints, or edited.
          </span>
        </label>
      )}

      {a && !a.clean && !a.syntheticMarkers.length && a.rows.length > 0 && (
        <label className="flex items-start gap-3 text-xs text-ink-2">
          <input type="checkbox" checked={acceptIssues} onChange={(e) => setAcceptIssues(e.target.checked)} className="mt-0.5 accent-[#7b8cff]" />
          Import only the {a.rows.length.toLocaleString("en-US")} valid row(s). Rejected and conflicting rows are recorded in the batch report.
        </label>
      )}

      <Button variant="primary" onClick={submit} loading={loading} disabled={!canImport}>
        Import {a?.rows.length ? a.rows.length.toLocaleString("en-US") : ""} rounds as {dataset === "real" ? "REAL DATA" : "TEST DATA"}
      </Button>
      {realBlocked && <p className="text-xs text-warn">Synthetic data can never be imported as REAL DATA.</p>}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-bad-ink">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      {result && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-good/40 bg-good/[0.07] p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good-ink" />
          <div className="text-ink-2">
            <p className="font-semibold text-ink">{result.batch.inserted_rows.toLocaleString("en-US")} new rounds imported.</p>
            <p className="mt-1 text-xs">
              Batch <span className="font-mono">{result.batch.id.slice(0, 8)}</span> · {result.analysis.totalRows.toLocaleString("en-US")} rows read ·{" "}
              {result.analysis.errors.length} rejected · {result.analysis.duplicates.length} duplicate(s) · {result.batch.already_stored} already stored
            </p>
            <p className="mt-1 font-mono text-[10px] break-all text-ink-3">sha256 {result.batch.rows_sha256}</p>
          </div>
        </div>
      )}
    </div>
  );
}
