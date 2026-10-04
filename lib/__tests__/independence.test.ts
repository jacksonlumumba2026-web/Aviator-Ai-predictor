import { describe, expect, it } from "vitest";
import ref from "./independence.ref.json";
import { acf, chi2Sf, chi2Table, holm, independenceReport, ksSf, ksTwoSample, ranks, runsTest } from "../independence";
import { generateDemoRounds } from "../demo";

// Reference values computed with scipy (lib/__tests__/independence.ref.json).
describe("special functions vs scipy", () => {
  it("chi-square survival function", () => {
    for (const [x, k, p] of ref.chi2) expect(chi2Sf(x, k)).toBeCloseTo(p, 9);
  });
  it("Kolmogorov distribution", () => {
    for (const [l, p] of ref.ks) expect(ksSf(l)).toBeCloseTo(p, 9);
  });
  it("two-sample KS statistic (with ties)", () => {
    expect(ksTwoSample(ref.ks2[0] as number[], ref.ks2[1] as number[]).d).toBeCloseTo(ref.ks2[2] as number, 12);
  });
  it("contingency chi-square", () => {
    const r = chi2Table(ref.table[0] as number[][]);
    expect(r.chi2).toBeCloseTo(ref.table[1] as number, 9);
    expect(r.dof).toBe(ref.table[2]);
    expect(r.p).toBeCloseTo(ref.table[3] as number, 9);
  });
  it("Holm adjustment", () => {
    holm(ref.holm[0]).forEach((v, i) => expect(v).toBeCloseTo(ref.holm[1][i], 12));
  });
  it("rank autocorrelation", () => {
    expect(acf(ranks(ref.acf1[0] as number[]), 1)[0]).toBeCloseTo(ref.acf1[1] as number, 12);
  });
  it("ranks average ties", () => {
    expect(ranks([3, 1, 3, 2])).toEqual([3.5, 1, 3.5, 2]);
  });
  it("runs test detects alternation", () => {
    const alt = Array.from({ length: 200 }, (_, i) => i % 2 === 0);
    expect(runsTest(alt)!.p).toBeLessThan(1e-10);
  });
});

describe("independence report", () => {
  it("does not reject independence on i.i.d. demo data", () => {
    const r = independenceReport(generateDemoRounds(3000).map((x) => x.multiplier))!;
    expect(r.dependenceDetected).toBe(false);
    expect(r.tests.length).toBeGreaterThanOrEqual(14);
    expect(r.tests.every((t) => t.pHolm >= t.p)).toBe(true);
    expect(r.exploitability).toMatch(/NOT established/);
  });

  it("detects planted lag-1 dependence and still refuses to call it exploitable", () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const xs: number[] = [1.5];
    for (let i = 0; i < 3000; i++) {
      const base = Math.max(1, Math.floor(97 / (1 - rnd())) / 100);
      xs.push(xs[xs.length - 1] < 1.3 && rnd() < 0.5 ? 2 + rnd() * 3 : base);
    }
    const r = independenceReport(xs)!;
    expect(r.dependenceDetected).toBe(true);
    expect(r.tests.find((t) => t.id === "lag1_transition")!.rejected).toBe(true);
    expect(r.exploitability).toMatch(/NOT established/);
  });

  it("detects a distribution shift over time", () => {
    const a = generateDemoRounds(1500, 1).map((x) => x.multiplier);
    const b = generateDemoRounds(1500, 2).map((x) => Math.round(x.multiplier * 1.6 * 100) / 100);
    const r = independenceReport([...a, ...b])!;
    expect(r.tests.find((t) => t.id === "ks_halves")!.rejected).toBe(true);
  });

  it("needs a minimum sample", () => {
    expect(independenceReport([1, 2, 3])).toBeNull();
  });
});
