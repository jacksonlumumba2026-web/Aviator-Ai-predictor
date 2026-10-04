/**
 * Data-quality report for a dataset or import batch: completeness, duplicates,
 * time gaps, distribution, threshold frequencies, and independence diagnostics.
 */
import { computeStats, type Stats } from "./stats";
import { independenceReport, type IndependenceReport } from "./independence";
import { timeGapAnalysis, type StrictImportAnalysis } from "./import/strict";

export interface QualityReport {
  generatedAt: string;
  totalRounds: number;
  uniqueRounds: number;
  duplicateCount: number;
  conflictingDuplicates: number;
  rejectedRows: number;
  missingTimestamps: number;
  missingMultipliers: number;
  impossibleValues: number;
  firstRoundTime: string | null;
  lastRoundTime: string | null;
  timeGaps: StrictImportAnalysis["timeGaps"];
  stats: Pick<Stats, "count" | "mean" | "median" | "min" | "max" | "std" | "below" | "reaching" | "histogram" | "streaks">;
  independence: IndependenceReport | null;
}

export function qualityReport(
  rounds: readonly { multiplier: number; round_time: string }[],
  importInfo?: Pick<StrictImportAnalysis, "errors" | "duplicates" | "conflicts" | "totalRows">,
): QualityReport {
  const xs = rounds.map((r) => r.multiplier);
  const s = computeStats(xs);
  const reasons = (re: RegExp) => importInfo?.errors.filter((e) => re.test(e.reason)).length ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    totalRounds: importInfo?.totalRows ?? rounds.length,
    uniqueRounds: new Set(rounds.map((r) => r.round_time)).size,
    duplicateCount: importInfo?.duplicates.length ?? 0,
    conflictingDuplicates: importInfo?.conflicts.length ?? 0,
    rejectedRows: importInfo?.errors.length ?? 0,
    missingTimestamps: reasons(/missing round_time/),
    missingMultipliers: reasons(/missing multiplier/),
    impossibleValues: reasons(/impossible/),
    firstRoundTime: rounds[0]?.round_time ?? null,
    lastRoundTime: rounds[rounds.length - 1]?.round_time ?? null,
    timeGaps: timeGapAnalysis(rounds.map((r) => r.round_time)),
    stats: {
      count: s.count, mean: s.mean, median: s.median, min: s.min, max: s.max, std: s.std,
      below: s.below, reaching: s.reaching, histogram: s.histogram, streaks: s.streaks,
    },
    independence: independenceReport(xs),
  };
}
