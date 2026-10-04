import { describe, expect, it } from "vitest";
import { computeStats, conditionalReachRates, histogram, rolling, streaks, wilson } from "../stats";

describe("computeStats", () => {
  const xs = [1.0, 1.1, 1.5, 2.0, 3.0, 10.0, 1.2, 5.0];
  const s = computeStats(xs);
  it("basic moments", () => {
    expect(s.count).toBe(8);
    expect(s.mean).toBeCloseTo(24.8 / 8);
    expect(s.median).toBeCloseTo(1.75);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
  });
  it("threshold shares", () => {
    expect(s.below["1.2x"].count).toBe(2);
    expect(s.below["2x"].count).toBe(4);
    expect(s.reaching["2x"].count).toBe(4);
    expect(s.reaching["10x"].count).toBe(1);
  });
  it("empty input is safe", () => {
    expect(computeStats([]).count).toBe(0);
  });
});

describe("streaks", () => {
  it("tracks longest and current runs", () => {
    const r = streaks([1.1, 1.2, 1.3, 2.5, 3, 1.1]);
    expect(r.longestBelow2x).toBe(3);
    expect(r.longestAtLeast2x).toBe(2);
    expect(r.current).toEqual({ length: 1, type: "below 2x" });
  });
});

describe("conditional reach rates", () => {
  it("counts rounds following low runs", () => {
    const r = conditionalReachRates([1.1, 2.5, 1.1, 1.1, 3.0, 1.0], 2);
    expect(r[0].next.n).toBe(6);
    // rounds preceded by >=1 low round: idx 1,3,4 -> hits at 1 and 4
    expect(r[1].next).toMatchObject({ n: 3, count: 2 });
    // preceded by >=2 low rounds: idx 4 only
    expect(r[2].next).toMatchObject({ n: 1, count: 1 });
  });
});

describe("misc", () => {
  it("histogram covers every value", () => {
    const h = histogram([1, 1.19, 1.2, 99, 100, 5000]);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(6);
    expect(h[h.length - 1].count).toBe(2);
  });
  it("rolling windows", () => {
    const r = rolling([1, 2, 3, 4, 5], 2);
    expect(r[0]).toMatchObject({ index: 2, mean: 1.5 });
    expect(r).toHaveLength(4);
  });
  it("wilson interval", () => {
    const w = wilson(50, 100);
    expect(w.lower).toBeGreaterThan(0.4);
    expect(w.upper).toBeLessThan(0.6);
  });
});
