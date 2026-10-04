import { DEMO_LABEL } from "./constants";

/**
 * Synthetic development data. DEMO DATA — NOT REAL GAME RESULTS.
 *
 * Rounds are drawn independently from a crash-style distribution with a 3%
 * house edge: P(X ≥ m) ≈ 0.97 / m. Because draws are i.i.d., there is no
 * signal to find — a correctly built pipeline should report *no edge* here.
 */
export const DEMO_SOURCE = "demo";
export const DEMO_NOTICE = DEMO_LABEL;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoRounds(n = 3000, seed = 20261004, start = "2026-09-01T00:00:00Z") {
  const rand = mulberry32(seed);
  let t = Date.parse(start);
  const out: { multiplier: number; round_time: string }[] = [];
  for (let i = 0; i < n; i++) {
    const u = rand();
    const m = Math.min(10_000, Math.max(1, Math.floor((100 * 0.97) / (1 - u)) / 100));
    out.push({ multiplier: m, round_time: new Date(t).toISOString() });
    t += 8_000 + Math.floor(rand() * 22_000);
  }
  return out;
}
