/**
 * Production-safe validation for legitimately obtained round history.
 *
 * Format: `multiplier,round_time` (header required; extra columns are ignored
 * except for synthetic-data markers). Runs identically in the browser
 * (preview) and on the server (authoritative).
 */
import { normaliseTime, parseMultiplier, splitCsvLine, type CsvIssue } from "../csv";
import { MAX_MULTIPLIER } from "../constants";

export const EARLIEST_PLAUSIBLE = "2018-01-01T00:00:00.000Z"; // before the game existed
export const MIN_PLAUSIBLE_INTERVAL_S = 2; // two rounds cannot finish < 2 s apart
export const FUTURE_TOLERANCE_MS = 60_000;

export interface StrictRow {
  line: number;
  multiplier: number;
  round_time: string; // canonical ISO-8601 UTC
}

export interface TimeGap {
  after: string;
  before: string;
  seconds: number;
  estimatedMissingRounds: number;
}

export interface StrictImportAnalysis {
  rows: StrictRow[]; // valid, de-duplicated, chronological
  errors: CsvIssue[]; // rejected rows (missing/invalid/impossible values)
  duplicates: CsvIssue[]; // exact duplicates within the file (same instant, same multiplier)
  conflicts: CsvIssue[]; // same instant, DIFFERENT multiplier — data integrity problem
  warnings: string[];
  syntheticMarkers: string[]; // reasons to believe the file is not real observations
  totalRows: number;
  wasChronological: boolean;
  timeGaps: {
    medianIntervalS: number | null;
    gapThresholdS: number | null;
    gaps: TimeGap[]; // largest first, capped
    gapCount: number;
    estimatedMissingRounds: number;
    implausibleIntervals: { after: string; before: string; seconds: number }[];
  };
  firstRoundTime: string | null;
  lastRoundTime: string | null;
  /** Policy: real data may only be imported when this is true (or the user explicitly accepts issues). */
  clean: boolean;
}

const STRICT_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/i;

function decimals(v: string) {
  const m = v.trim().replace(/x$/i, "").match(/\.(\d+)$/);
  return m ? m[1].length : 0;
}

export function analyseStrict(text: string, opts: { now?: number; fileName?: string } = {}): StrictImportAnalysis {
  const now = opts.now ?? Date.now();
  const res: StrictImportAnalysis = {
    rows: [],
    errors: [],
    duplicates: [],
    conflicts: [],
    warnings: [],
    syntheticMarkers: [],
    totalRows: 0,
    wasChronological: true,
    timeGaps: { medianIntervalS: null, gapThresholdS: null, gaps: [], gapCount: 0, estimatedMissingRounds: 0, implausibleIntervals: [] },
    firstRoundTime: null,
    lastRoundTime: null,
    clean: false,
  };
  if (opts.fileName && /demo|synthetic|fake|simulat/i.test(opts.fileName)) res.syntheticMarkers.push(`file name "${opts.fileName}" suggests synthetic data`);

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const comments = lines.filter((l) => l.trimStart().startsWith("#"));
  if (comments.some((l) => /demo|not real|synthetic|test data/i.test(l))) res.syntheticMarkers.push("file contains a DEMO / synthetic / TEST DATA banner");
  const content = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim() !== "" && !l.trimStart().startsWith("#"));
  if (!content.length) {
    res.errors.push({ line: 0, raw: "", reason: "file is empty" });
    return res;
  }
  const header = splitCsvLine(content[0].l).map((h) => h.toLowerCase());
  const mi = header.indexOf("multiplier");
  const ti = header.indexOf("round_time");
  if (mi === -1 || ti === -1) {
    res.errors.push({ line: content[0].i + 1, raw: content[0].l, reason: 'header must be "multiplier,round_time"' });
    return res;
  }
  const extra = header.filter((h) => h !== "multiplier" && h !== "round_time");
  if (extra.length) res.warnings.push(`Ignored extra column(s): ${extra.join(", ")}.`);
  const di = header.indexOf("dataset");
  const demoCol = header.indexOf("is_demo");

  const seen = new Map<string, { line: number; multiplier: number }>();
  let markedSynthetic = 0;
  for (const { l: raw, i } of content.slice(1)) {
    const line = i + 1;
    res.totalRows++;
    const cells = splitCsvLine(raw);
    if (cells.length !== header.length) {
      res.errors.push({ line, raw, reason: `malformed row: expected ${header.length} columns, found ${cells.length}` });
      continue;
    }
    if ((di >= 0 && /^(demo|test)$/i.test(cells[di])) || (demoCol >= 0 && /^true$/i.test(cells[demoCol]))) markedSynthetic++;

    const mRaw = cells[mi];
    const tRaw = cells[ti];
    if (!mRaw) {
      res.errors.push({ line, raw, reason: "missing multiplier" });
      continue;
    }
    if (!tRaw) {
      res.errors.push({ line, raw, reason: "missing round_time" });
      continue;
    }
    const m = parseMultiplier(mRaw);
    if (m === null || !Number.isFinite(m)) {
      res.errors.push({ line, raw, reason: "multiplier is not a number" });
      continue;
    }
    if (m < 1) {
      res.errors.push({ line, raw, reason: "impossible value: multiplier must be ≥ 1.00" });
      continue;
    }
    if (m > MAX_MULTIPLIER) {
      res.errors.push({ line, raw, reason: `impossible value: multiplier exceeds ${MAX_MULTIPLIER.toLocaleString("en-US")}` });
      continue;
    }
    if (decimals(mRaw) > 2) {
      res.errors.push({ line, raw, reason: "impossible precision: multipliers are reported to 2 decimal places" });
      continue;
    }
    if (!STRICT_TIME.test(tRaw.trim())) {
      res.errors.push({
        line,
        raw,
        reason: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(tRaw.trim())
          ? "round_time has no timezone (append Z or an offset such as +03:00)"
          : "round_time must be ISO-8601 with seconds and timezone, e.g. 2026-10-04T10:00:01Z",
      });
      continue;
    }
    const t = normaliseTime(tRaw);
    if (!t) {
      res.errors.push({ line, raw, reason: "round_time is not a real calendar time" });
      continue;
    }
    const ms = Date.parse(t.iso);
    if (ms > now + FUTURE_TOLERANCE_MS) {
      res.errors.push({ line, raw, reason: "impossible value: round_time is in the future" });
      continue;
    }
    if (t.iso < EARLIEST_PLAUSIBLE) {
      res.errors.push({ line, raw, reason: "impossible value: round_time predates the game" });
      continue;
    }
    const prev = seen.get(t.iso);
    if (prev) {
      if (prev.multiplier === m) res.duplicates.push({ line, raw, reason: `duplicate of line ${prev.line}` });
      else res.conflicts.push({ line, raw, reason: `conflicts with line ${prev.line} (${prev.multiplier.toFixed(2)}x at the same instant)` });
      continue;
    }
    seen.set(t.iso, { line, multiplier: m });
    if (res.rows.length && t.iso < res.rows[res.rows.length - 1].round_time) res.wasChronological = false;
    res.rows.push({ line, multiplier: m, round_time: t.iso });
  }
  if (markedSynthetic) res.syntheticMarkers.push(`${markedSynthetic} row(s) are labelled demo/test in a dataset column`);
  if (res.conflicts.length) {
    // Neither value can be trusted: drop every row at a conflicting instant.
    const bad = new Set(res.conflicts.map((c) => normaliseTime(splitCsvLine(c.raw)[ti])!.iso));
    res.rows = res.rows.filter((r) => !bad.has(r.round_time));
  }
  res.rows.sort((a, b) => (a.round_time < b.round_time ? -1 : a.round_time > b.round_time ? 1 : 0));
  if (!res.wasChronological) res.warnings.push("Rows were not in chronological order; they were sorted by round_time.");

  res.timeGaps = timeGapAnalysis(res.rows.map((r) => r.round_time));
  if (res.timeGaps.gapCount) {
    res.warnings.push(
      `${res.timeGaps.gapCount} time gap(s) longer than ${res.timeGaps.gapThresholdS!.toFixed(0)} s — about ${res.timeGaps.estimatedMissingRounds.toLocaleString("en-US")} round(s) appear to be missing. Models treat stored rounds as consecutive.`,
    );
  }
  if (res.timeGaps.implausibleIntervals.length)
    res.warnings.push(`${res.timeGaps.implausibleIntervals.length} pair(s) of rounds are < ${MIN_PLAUSIBLE_INTERVAL_S} s apart (possible duplicates or clock errors).`);
  res.firstRoundTime = res.rows[0]?.round_time ?? null;
  res.lastRoundTime = res.rows[res.rows.length - 1]?.round_time ?? null;
  res.clean = res.rows.length > 0 && !res.errors.length && !res.conflicts.length && !res.syntheticMarkers.length;
  return res;
}

/** Detect missing data from the spacing of consecutive round timestamps. */
export function timeGapAnalysis(times: readonly string[]): StrictImportAnalysis["timeGaps"] {
  const ms = times.map((t) => Date.parse(t));
  const iv: number[] = [];
  for (let i = 1; i < ms.length; i++) iv.push((ms[i] - ms[i - 1]) / 1000);
  if (iv.length < 10) return { medianIntervalS: null, gapThresholdS: null, gaps: [], gapCount: 0, estimatedMissingRounds: 0, implausibleIntervals: [] };
  const sorted = [...iv].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const threshold = Math.max(3 * median, 60);
  const gaps: TimeGap[] = [];
  const implausible: { after: string; before: string; seconds: number }[] = [];
  iv.forEach((s, k) => {
    if (s > threshold)
      gaps.push({ after: times[k], before: times[k + 1], seconds: s, estimatedMissingRounds: Math.max(0, Math.round(s / median) - 1) });
    if (s < MIN_PLAUSIBLE_INTERVAL_S) implausible.push({ after: times[k], before: times[k + 1], seconds: s });
  });
  gaps.sort((a, b) => b.seconds - a.seconds);
  return {
    medianIntervalS: median,
    gapThresholdS: threshold,
    gaps: gaps.slice(0, 50),
    gapCount: gaps.length,
    estimatedMissingRounds: gaps.reduce((a, g) => a + g.estimatedMissingRounds, 0),
    implausibleIntervals: implausible.slice(0, 50),
  };
}

/** SHA-256 hex digest (Web Crypto: works in the browser and in Node). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Content checksum independent of formatting / row order. */
export const canonicalRows = (rows: readonly { multiplier: number; round_time: string }[]) =>
  rows.map((r) => `${r.multiplier.toFixed(2)},${r.round_time}`).join("\n");
