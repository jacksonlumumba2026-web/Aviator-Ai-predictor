/**
 * Sequential-dependence diagnostics for crash multipliers.
 *
 * Multipliers are heavy-tailed and discrete (0.01 steps), so nothing here
 * assumes normality: tests use ranks, threshold indicators or categorical
 * tiers. All p-values in the family are Holm–Bonferroni adjusted.
 *
 * IMPORTANT DISTINCTION
 *  - "Evidence of dependence": some test rejects independence after Holm
 *    correction. With large samples even negligible dependence can be
 *    statistically significant.
 *  - "Evidence that dependence is exploitable": requires that a frozen model
 *    beats the base rate on untouched future rounds (the validation protocol).
 *    Nothing in this file can establish exploitability.
 */
import { normalSf, wilson, Z95, type RateWithCi } from "./stats";

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9)
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // series for P, then Q = 1 - P
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)));
  }
  // continued fraction (modified Lentz)
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h);
}

/** Upper tail of the chi-square distribution. */
export const chi2Sf = (x: number, dof: number) => gammaQ(dof / 2, x / 2);

/** Kolmogorov distribution upper tail Q_KS(λ). */
export function ksSf(lambda: number): number {
  if (lambda < 1e-3) return 1;
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    const t = 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += t;
    if (Math.abs(t) < 1e-12) break;
  }
  return Math.min(1, Math.max(0, sum));
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Average ranks (ties share the mean rank). */
export function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

/** Sample autocorrelation at lags 1..maxLag. */
export function acf(xs: readonly number[], maxLag: number): number[] {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  let den = 0;
  for (const x of xs) den += (x - m) ** 2;
  const out: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let t = k; t < n; t++) num += (xs[t] - m) * (xs[t - k] - m);
    out.push(den > 0 ? num / den : 0);
  }
  return out;
}

export function ljungBox(r: readonly number[], n: number): { q: number; dof: number; p: number } {
  let q = 0;
  r.forEach((rk, i) => (q += (rk * rk) / (n - (i + 1))));
  q *= n * (n + 2);
  return { q, dof: r.length, p: chi2Sf(q, r.length) };
}

export function runsTest(ind: readonly boolean[]) {
  const n = ind.length;
  const n1 = ind.filter(Boolean).length;
  const n2 = n - n1;
  if (!n1 || !n2) return null;
  let runs = 1;
  for (let i = 1; i < n; i++) if (ind[i] !== ind[i - 1]) runs++;
  const expected = (2 * n1 * n2) / n + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const z = variance > 0 ? (runs - expected) / Math.sqrt(variance) : 0;
  return { runs, expected, z, p: 2 * normalSf(Math.abs(z)) };
}

/** Pearson chi-square test of independence / homogeneity on a contingency table. */
export function chi2Table(table: number[][]) {
  // drop empty rows/columns
  const rows = table.filter((r) => r.some((v) => v > 0));
  const keep = rows[0].map((_, j) => rows.some((r) => r[j] > 0));
  const t = rows.map((r) => r.filter((_, j) => keep[j]));
  const R = t.length;
  const C = t[0].length;
  const n = t.flat().reduce((a, b) => a + b, 0);
  const rs = t.map((r) => r.reduce((a, b) => a + b, 0));
  const cs = t[0].map((_, j) => t.reduce((a, r) => a + r[j], 0));
  let chi2 = 0;
  let minExpected = Infinity;
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      const e = (rs[i] * cs[j]) / n;
      minExpected = Math.min(minExpected, e);
      chi2 += (t[i][j] - e) ** 2 / e;
    }
  const dof = (R - 1) * (C - 1);
  return { chi2, dof, p: dof > 0 ? chi2Sf(chi2, dof) : 1, cramersV: Math.sqrt(chi2 / (n * Math.max(1, Math.min(R - 1, C - 1)))), minExpected };
}

/** Two-sample Kolmogorov–Smirnov (asymptotic). Conservative with ties. */
export function ksTwoSample(a: readonly number[], b: readonly number[]) {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i], y[j]);
    while (i < x.length && x[i] <= v) i++;
    while (j < y.length && y[j] <= v) j++;
    d = Math.max(d, Math.abs(i / x.length - j / y.length));
  }
  const ne = (x.length * y.length) / (x.length + y.length);
  const sq = Math.sqrt(ne);
  return { d, p: ksSf((sq + 0.12 + 0.11 / sq) * d) };
}

/** Holm–Bonferroni step-down adjusted p-values (same order as input). */
export function holm(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const adj = new Array<number>(m);
  let running = 0;
  order.forEach(([p, i], k) => {
    running = Math.max(running, Math.min(1, (m - k) * p));
    adj[i] = running;
  });
  return adj;
}

// ---------------------------------------------------------------------------
// The diagnostic suite
// ---------------------------------------------------------------------------

export const TIERS = [
  { label: "<1.5x", lo: 1, hi: 1.5 },
  { label: "1.5–2x", lo: 1.5, hi: 2 },
  { label: "2–3x", lo: 2, hi: 3 },
  { label: "3–10x", lo: 3, hi: 10 },
  { label: "≥10x", lo: 10, hi: Infinity },
] as const;
const tierOf = (m: number) => TIERS.findIndex((t) => m >= t.lo && m < t.hi);

export interface DiagnosticTest {
  id: string;
  family: "autocorrelation" | "runs" | "lag_dependence" | "conditional" | "stability";
  name: string;
  statistic: string;
  p: number;
  pHolm: number;
  effect: string;
  rejected: boolean;
}

export interface IndependenceReport {
  n: number;
  alpha: number;
  tests: DiagnosticTest[];
  rankAcf: { lag: number; r: number }[];
  indicatorAcf2x: { lag: number; r: number }[];
  acfBand: number;
  conditional: { condition: string; n: number; rate: RateWithCi; complementRate: number; diffPp: number; p: number }[];
  blocks: { block: number; start: number; end: number; reach2x: RateWithCi; median: number }[];
  transition: { table: number[][]; cramersV: number };
  maxAbsRankAcf: number;
  dependenceDetected: boolean;
  /** Largest practical effect among rejected tests, for judging whether a detected dependence is negligible. */
  summary: string;
  exploitability: string;
}

const ALPHA = 0.05;
const MAX_LAG = 20;
const N_BLOCKS = 10;
const THRESHOLDS = [1.5, 2, 3, 5, 10];
export const MIN_ROUNDS_FOR_DIAGNOSTICS = 200;

export function independenceReport(xs: readonly number[]): IndependenceReport | null {
  const n = xs.length;
  if (n < MIN_ROUNDS_FOR_DIAGNOSTICS) return null;
  const raw: Omit<DiagnosticTest, "pHolm" | "rejected">[] = [];

  // 1) Autocorrelation of ranks (= of ln m; distribution-free) and of the ≥2x indicator.
  const rk = acf(ranks(xs), MAX_LAG);
  const lbR = ljungBox(rk, n);
  const maxR = rk.reduce((a, r, i) => (Math.abs(r) > Math.abs(a.r) ? { lag: i + 1, r } : a), { lag: 1, r: 0 });
  raw.push({
    id: "ljung_box_ranks",
    family: "autocorrelation",
    name: `Ljung–Box on rank autocorrelation, lags 1–${MAX_LAG}`,
    statistic: `Q = ${lbR.q.toFixed(2)}, dof ${lbR.dof}`,
    p: lbR.p,
    effect: `max |ρ| = ${Math.abs(maxR.r).toFixed(4)} at lag ${maxR.lag}`,
  });
  const ind2 = xs.map((x) => (x >= 2 ? 1 : 0));
  const ia = acf(ind2, MAX_LAG);
  const lbI = ljungBox(ia, n);
  const maxI = ia.reduce((a, r, i) => (Math.abs(r) > Math.abs(a.r) ? { lag: i + 1, r } : a), { lag: 1, r: 0 });
  raw.push({
    id: "ljung_box_ind2x",
    family: "autocorrelation",
    name: `Ljung–Box on ≥2x indicator autocorrelation, lags 1–${MAX_LAG}`,
    statistic: `Q = ${lbI.q.toFixed(2)}, dof ${lbI.dof}`,
    p: lbI.p,
    effect: `max |ρ| = ${Math.abs(maxI.r).toFixed(4)} at lag ${maxI.lag}`,
  });

  // 2) Runs tests per threshold.
  for (const k of THRESHOLDS) {
    const r = runsTest(xs.map((x) => x >= k));
    if (!r) continue;
    raw.push({
      id: `runs_${k}x`,
      family: "runs",
      name: `Wald–Wolfowitz runs test, ≥${k}x indicator`,
      statistic: `runs ${r.runs} vs expected ${r.expected.toFixed(1)}, z = ${r.z.toFixed(2)}`,
      p: r.p,
      effect: `${(((r.runs - r.expected) / r.expected) * 100).toFixed(2)}% vs expected`,
    });
  }

  // 3) Lag-1 tier transitions (does the previous tier change the next tier's distribution?).
  const table = TIERS.map(() => TIERS.map(() => 0));
  for (let t = 1; t < n; t++) table[tierOf(xs[t - 1])][tierOf(xs[t])]++;
  const tr = chi2Table(table);
  raw.push({
    id: "lag1_transition",
    family: "lag_dependence",
    name: "Lag-1 tier transition χ² test (5×5)",
    statistic: `χ² = ${tr.chi2.toFixed(2)}, dof ${tr.dof}, min expected ${tr.minExpected.toFixed(1)}`,
    p: tr.p,
    effect: `Cramér's V = ${tr.cramersV.toFixed(4)}`,
  });

  // 4) Conditional frequencies of the next round reaching ≥2x vs the complement.
  const conds: { label: string; f: (i: number) => boolean }[] = [
    { label: "previous < 1.2x", f: (i) => xs[i - 1] < 1.2 },
    { label: "previous ≥ 2x", f: (i) => xs[i - 1] >= 2 },
    { label: "previous ≥ 10x", f: (i) => xs[i - 1] >= 10 },
    { label: "previous 3 all < 2x", f: (i) => i >= 3 && xs[i - 1] < 2 && xs[i - 2] < 2 && xs[i - 3] < 2 },
    { label: "previous 5 all < 2x", f: (i) => i >= 5 && [1, 2, 3, 4, 5].every((k) => xs[i - k] < 2) },
    { label: "previous 3 all ≥ 2x", f: (i) => i >= 3 && xs[i - 1] >= 2 && xs[i - 2] >= 2 && xs[i - 3] >= 2 },
  ];
  const conditional: IndependenceReport["conditional"] = [];
  for (const c of conds) {
    let n1 = 0, h1 = 0, n0 = 0, h0 = 0;
    for (let i = 5; i < n; i++) {
      const hit = xs[i] >= 2 ? 1 : 0;
      if (c.f(i)) { n1++; h1 += hit; } else { n0++; h0 += hit; }
    }
    if (n1 < 20 || n0 < 20) continue;
    const p1 = h1 / n1, p0 = h0 / n0, pp = (h1 + h0) / (n1 + n0);
    const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n0));
    const z = se > 0 ? (p1 - p0) / se : 0;
    const p = 2 * normalSf(Math.abs(z));
    conditional.push({ condition: c.label, n: n1, rate: wilson(h1, n1), complementRate: p0, diffPp: (p1 - p0) * 100, p });
    raw.push({
      id: `cond_${c.label}`,
      family: "conditional",
      name: `P(next ≥ 2x | ${c.label}) vs otherwise`,
      statistic: `${(p1 * 100).toFixed(1)}% (n ${n1}) vs ${(p0 * 100).toFixed(1)}%, z = ${z.toFixed(2)}`,
      p,
      effect: `${((p1 - p0) * 100).toFixed(2)} pp`,
    });
  }

  // 5) Distribution stability over time.
  const size = Math.floor(n / N_BLOCKS);
  const blocks: IndependenceReport["blocks"] = [];
  const blockTable: number[][] = [];
  for (let b = 0; b < N_BLOCKS; b++) {
    const seg = xs.slice(b * size, b === N_BLOCKS - 1 ? n : (b + 1) * size);
    const counts = TIERS.map(() => 0);
    seg.forEach((x) => counts[tierOf(x)]++);
    blockTable.push(counts);
    const sorted = [...seg].sort((p, q) => p - q);
    blocks.push({
      block: b + 1,
      start: b * size,
      end: b * size + seg.length - 1,
      reach2x: wilson(seg.filter((x) => x >= 2).length, seg.length),
      median: sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2,
    });
  }
  const hom = chi2Table(blockTable);
  raw.push({
    id: "block_homogeneity",
    family: "stability",
    name: `Tier distribution homogeneity across ${N_BLOCKS} consecutive blocks`,
    statistic: `χ² = ${hom.chi2.toFixed(2)}, dof ${hom.dof}`,
    p: hom.p,
    effect: `Cramér's V = ${hom.cramersV.toFixed(4)}`,
  });
  const half = n >> 1;
  const ks = ksTwoSample(xs.slice(0, half), xs.slice(half));
  raw.push({
    id: "ks_halves",
    family: "stability",
    name: "Kolmogorov–Smirnov, first half vs second half",
    statistic: `D = ${ks.d.toFixed(4)}`,
    p: ks.p,
    effect: `D = ${ks.d.toFixed(4)}`,
  });

  const adj = holm(raw.map((t) => t.p));
  const tests: DiagnosticTest[] = raw.map((t, i) => ({ ...t, pHolm: adj[i], rejected: adj[i] < ALPHA }));
  const rejected = tests.filter((t) => t.rejected);
  const dependenceDetected = rejected.length > 0;

  return {
    n,
    alpha: ALPHA,
    tests,
    rankAcf: rk.map((r, i) => ({ lag: i + 1, r })),
    indicatorAcf2x: ia.map((r, i) => ({ lag: i + 1, r })),
    acfBand: Z95 / Math.sqrt(n),
    conditional,
    blocks,
    transition: { table, cramersV: tr.cramersV },
    maxAbsRankAcf: Math.abs(maxR.r),
    dependenceDetected,
    summary: dependenceDetected
      ? `Evidence of dependence: ${rejected.length} of ${tests.length} tests reject independence after Holm correction (${rejected
          .map((t) => `${t.name}: ${t.effect}`)
          .join("; ")}). Statistical significance alone does not mean the effect is large.`
      : `No evidence of dependence: none of ${tests.length} tests rejects independence after Holm correction (α = ${ALPHA}). This does not prove independence — small effects may be undetectable at n = ${n.toLocaleString("en-US")}.`,
    exploitability:
      "Exploitability is NOT established by these diagnostics. Detected dependence is only exploitable if a frozen model, chosen without the test data, beats the base rate on untouched future rounds — see the validation protocol.",
  };
}
