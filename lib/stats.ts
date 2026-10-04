/**
 * Descriptive statistics engine.
 *
 * Everything here *describes* stored history. Nothing here predicts. In
 * particular, streak lengths are reported as descriptive facts only — a run
 * of low rounds is not evidence that a high round is "due". The conditional
 * reach-rate table exists precisely so that claim can be checked against data.
 */

export const Z95 = 1.959963984540054;

export interface RateWithCi {
  rate: number;
  lower: number;
  upper: number;
  count: number;
  n: number;
}

export interface HistogramBin {
  label: string;
  lower: number;
  upper: number | null;
  count: number;
  share: number;
}

export interface RollingPoint {
  index: number;
  mean: number;
  median: number;
  volatility: number;
}

export interface StreakSummary {
  longestBelow2x: number;
  longestAtLeast2x: number;
  longestBelow1_5x: number;
  current: { length: number; type: "below 2x" | "≥2x" } | null;
}

export interface ConditionalRate {
  condition: string;
  afterLowRun: number;
  next: RateWithCi;
}

export interface IndependenceTests {
  lag1Autocorrelation: number | null;
  autocorrelationBand: number | null;
  runsTest: { runs: number; expected: number; z: number; pValue: number } | null;
}

export interface Stats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  below: Record<"1.2x" | "1.5x" | "2x", RateWithCi>;
  reaching: Record<"1.5x" | "2x" | "3x" | "5x" | "10x", RateWithCi>;
  histogram: HistogramBin[];
  streaks: StreakSummary;
  conditional: ConditionalRate[];
  independence: IndependenceTests;
}

export function wilson(count: number, n: number, z = Z95): RateWithCi {
  if (n === 0) return { rate: 0, lower: 0, upper: 1, count, n };
  const p = count / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { rate: p, lower: Math.max(0, centre - half), upper: Math.min(1, centre + half), count, n };
}

export function normalSf(z: number): number {
  return 0.5 * erfc(z / Math.SQRT2);
}

/** Complementary error function (Numerical Recipes erfcc, |error| < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function mean(xs: readonly number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n − 1). */
export function std(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

const BIN_EDGES = [1, 1.2, 1.5, 2, 3, 5, 10, 20, 50, 100];

export function histogram(xs: readonly number[]): HistogramBin[] {
  const bins: HistogramBin[] = BIN_EDGES.map((lower, i) => {
    const upper = BIN_EDGES[i + 1] ?? null;
    const fmt = (v: number) => (v % 1 === 0 ? `${v}` : v.toFixed(1));
    return { label: upper === null ? `${fmt(lower)}x+` : `${fmt(lower)}–${fmt(upper)}x`, lower, upper, count: 0, share: 0 };
  });
  for (const x of xs) {
    let i = BIN_EDGES.length - 1;
    while (i > 0 && x < BIN_EDGES[i]) i--;
    bins[i].count++;
  }
  for (const b of bins) b.share = xs.length ? b.count / xs.length : 0;
  return bins;
}

/**
 * Rolling mean / median / volatility (std of log multipliers) over `window`
 * rounds, downsampled to at most `maxPoints` for charting.
 */
export function rolling(xs: readonly number[], window: number, maxPoints = 300): RollingPoint[] {
  if (xs.length < window) return [];
  const step = Math.max(1, Math.floor((xs.length - window + 1) / maxPoints));
  const out: RollingPoint[] = [];
  for (let end = window; end <= xs.length; end += step) {
    const slice = xs.slice(end - window, end);
    out.push({ index: end, mean: mean(slice), median: median(slice), volatility: std(slice.map(Math.log)) });
  }
  return out;
}

export function streaks(xs: readonly number[]): StreakSummary {
  let longestBelow2x = 0;
  let longestAtLeast2x = 0;
  let longestBelow1_5x = 0;
  let runLow = 0;
  let runHigh = 0;
  let run15 = 0;
  for (const x of xs) {
    if (x < 2) {
      runLow++;
      runHigh = 0;
    } else {
      runHigh++;
      runLow = 0;
    }
    run15 = x < 1.5 ? run15 + 1 : 0;
    longestBelow2x = Math.max(longestBelow2x, runLow);
    longestAtLeast2x = Math.max(longestAtLeast2x, runHigh);
    longestBelow1_5x = Math.max(longestBelow1_5x, run15);
  }
  const current = xs.length ? (runLow > 0 ? { length: runLow, type: "below 2x" as const } : { length: runHigh, type: "≥2x" as const }) : null;
  return { longestBelow2x, longestAtLeast2x, longestBelow1_5x, current };
}

/**
 * Empirical P(next ≥ 2x | previous k rounds were all below 2x), k = 0..5.
 * If rounds are independent these rates should all overlap the k = 0 rate.
 */
export function conditionalReachRates(xs: readonly number[], maxK = 5): ConditionalRate[] {
  const out: ConditionalRate[] = [];
  for (let k = 0; k <= maxK; k++) {
    let n = 0;
    let hits = 0;
    let run = 0;
    for (let i = 0; i < xs.length; i++) {
      if (i >= k && run >= k) {
        n++;
        if (xs[i] >= 2) hits++;
      }
      run = xs[i] < 2 ? run + 1 : 0;
    }
    out.push({
      condition: k === 0 ? "Any round (unconditional)" : `After ${k}+ consecutive rounds below 2x`,
      afterLowRun: k,
      next: wilson(hits, n),
    });
  }
  return out;
}

export function independenceTests(xs: readonly number[]): IndependenceTests {
  const n = xs.length;
  if (n < 30) return { lag1Autocorrelation: null, autocorrelationBand: null, runsTest: null };
  const logs = xs.map(Math.log);
  const m = mean(logs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (logs[i] - m) ** 2;
    if (i > 0) num += (logs[i] - m) * (logs[i - 1] - m);
  }
  const lag1 = den > 0 ? num / den : 0;

  // Wald–Wolfowitz runs test on the ≥2x indicator.
  const ind = xs.map((x) => x >= 2);
  const n1 = ind.filter(Boolean).length;
  const n2 = n - n1;
  let runsTest: IndependenceTests["runsTest"] = null;
  if (n1 > 0 && n2 > 0) {
    let runs = 1;
    for (let i = 1; i < n; i++) if (ind[i] !== ind[i - 1]) runs++;
    const expected = (2 * n1 * n2) / n + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
    const z = variance > 0 ? (runs - expected) / Math.sqrt(variance) : 0;
    runsTest = { runs, expected, z, pValue: 2 * normalSf(Math.abs(z)) };
  }
  return { lag1Autocorrelation: lag1, autocorrelationBand: Z95 / Math.sqrt(n), runsTest };
}

export function computeStats(xs: readonly number[]): Stats {
  const n = xs.length;
  const countIf = (pred: (x: number) => boolean) => xs.reduce((acc, x) => acc + (pred(x) ? 1 : 0), 0);
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return {
    count: n,
    mean: mean(xs),
    median: median(xs),
    min: n ? min : 0,
    max: n ? max : 0,
    std: std(xs),
    below: {
      "1.2x": wilson(countIf((x) => x < 1.2), n),
      "1.5x": wilson(countIf((x) => x < 1.5), n),
      "2x": wilson(countIf((x) => x < 2), n),
    },
    reaching: {
      "1.5x": wilson(countIf((x) => x >= 1.5), n),
      "2x": wilson(countIf((x) => x >= 2), n),
      "3x": wilson(countIf((x) => x >= 3), n),
      "5x": wilson(countIf((x) => x >= 5), n),
      "10x": wilson(countIf((x) => x >= 10), n),
    },
    histogram: histogram(xs),
    streaks: streaks(xs),
    conditional: conditionalReachRates(xs),
    independence: independenceTests(xs),
  };
}
