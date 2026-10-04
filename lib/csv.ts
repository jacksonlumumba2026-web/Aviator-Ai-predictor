import { MAX_MULTIPLIER } from "./constants";

export interface CsvIssue {
  line: number;
  raw: string;
  reason: string;
}

export interface ValidRow {
  line: number;
  multiplier: number;
  round_time: string; // normalised ISO-8601 UTC
}

export interface ParsedRounds {
  rows: ValidRow[]; // chronologically sorted, de-duplicated
  errors: CsvIssue[]; // malformed / invalid rows (rejected)
  duplicates: CsvIssue[]; // duplicate rounds within the file (skipped)
  warnings: string[];
  totalRows: number;
}

export const MAX_CSV_BYTES = 8 * 1024 * 1024;
export const MAX_CSV_ROWS = 200_000;

/** Split one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HAS_TZ = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Parse a timestamp into canonical ISO UTC. Timestamps without a zone are treated as UTC. */
export function normaliseTime(value: string): { iso: string; assumedUtc: boolean } | null {
  const v = value.trim();
  if (!v || !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(v)) return null;
  const assumedUtc = !HAS_TZ.test(v);
  const candidate = (assumedUtc ? v + (v.length === 10 ? "T00:00:00Z" : "Z") : v).replace(" ", "T");
  const ms = Date.parse(candidate);
  if (Number.isNaN(ms)) return null;
  return { iso: new Date(ms).toISOString(), assumedUtc };
}

export function parseMultiplier(value: string): number | null {
  const v = value.trim().replace(/x$/i, "");
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function validateMultiplier(n: number | null): string | null {
  if (n === null) return "multiplier is not a number";
  if (n < 1) return "multiplier must be ≥ 1.00";
  if (n > MAX_MULTIPLIER) return `multiplier exceeds ${MAX_MULTIPLIER.toLocaleString()}`;
  return null;
}

/** Parse and validate CSV text with `multiplier,round_time` columns. */
export function parseRoundsCsv(text: string): ParsedRounds {
  const result: ParsedRounds = { rows: [], errors: [], duplicates: [], warnings: [], totalRows: 0 };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const isSkippable = (l: string) => l.trim() === "" || l.trimStart().startsWith("#");
  const headerIdx = lines.findIndex((l) => !isSkippable(l));
  if (headerIdx === -1) {
    result.errors.push({ line: 0, raw: "", reason: "file is empty" });
    return result;
  }

  const header = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const mi = header.indexOf("multiplier");
  const ti = header.indexOf("round_time");
  if (mi === -1 || ti === -1) {
    result.errors.push({
      line: headerIdx + 1,
      raw: lines[headerIdx],
      reason: 'header must contain "multiplier" and "round_time" columns',
    });
    return result;
  }

  const seen = new Map<string, number>();
  let assumedUtc = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (isSkippable(raw)) continue; // blank lines and "# comment" lines
    result.totalRows++;
    if (result.totalRows > MAX_CSV_ROWS) {
      result.errors.push({ line: i + 1, raw: "", reason: `row limit of ${MAX_CSV_ROWS.toLocaleString()} exceeded; remaining rows ignored` });
      break;
    }
    const line = i + 1;
    const cells = splitCsvLine(raw);
    if (cells.length !== header.length) {
      result.errors.push({ line, raw, reason: `expected ${header.length} columns, found ${cells.length}` });
      continue;
    }
    const multiplier = parseMultiplier(cells[mi]);
    const mErr = validateMultiplier(multiplier);
    if (mErr) {
      result.errors.push({ line, raw, reason: mErr });
      continue;
    }
    const time = normaliseTime(cells[ti]);
    if (!time) {
      result.errors.push({ line, raw, reason: "round_time is not a valid ISO-8601 timestamp" });
      continue;
    }
    if (time.assumedUtc) assumedUtc++;
    const firstLine = seen.get(time.iso);
    if (firstLine !== undefined) {
      result.duplicates.push({ line, raw, reason: `duplicate of line ${firstLine} (same round_time)` });
      continue;
    }
    seen.set(time.iso, line);
    result.rows.push({ line, multiplier: multiplier!, round_time: time.iso });
  }

  const wasSorted = result.rows.every((r, idx, a) => idx === 0 || a[idx - 1].round_time <= r.round_time);
  result.rows.sort((a, b) => (a.round_time < b.round_time ? -1 : a.round_time > b.round_time ? 1 : 0));
  if (!wasSorted) result.warnings.push("Rows were not in chronological order and have been sorted by round_time.");
  if (assumedUtc) result.warnings.push(`${assumedUtc} timestamp(s) had no timezone and were interpreted as UTC.`);
  return result;
}

/** Serialise rounds to CSV for export. */
export function roundsToCsv(rows: { multiplier: number; round_time: string; source: string; is_demo: boolean }[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const body = rows.map((r) => [r.multiplier.toFixed(2), r.round_time, esc(r.source), r.is_demo ? "true" : "false"].join(","));
  return ["multiplier,round_time,source,is_demo", ...body].join("\n") + "\n";
}
