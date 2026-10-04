/** Emits the app's statistics (lib/stats.ts) for a dataset read through the app's repository. */
import { getRepository } from "@/services/repository";
import { computeStats, rolling, streaks } from "@/lib/stats";

const dataset = (process.argv[2] as "real" | "demo") || "demo";
const rounds = await getRepository().allRounds({ dataset });
const xs = rounds.map((r) => r.multiplier);
const roll = rolling(xs, 50, 1_000_000); // every window, no downsampling
const pick = (i: number) => roll.find((p) => p.index === i)!;
const s = computeStats(xs);
console.log(
  JSON.stringify({
    count: s.count, mean: s.mean, median: s.median, min: s.min, max: s.max, std: s.std,
    below: Object.fromEntries(Object.entries(s.below).map(([k, v]) => [k, v.count])),
    reaching: Object.fromEntries(Object.entries(s.reaching).map(([k, v]) => [k, v.count])),
    histogram: s.histogram.map((b) => b.count),
    rolling: { 50: pick(50), 1000: pick(1000), 3000: pick(xs.length) },
    streaks: streaks(xs),
    first_time: rounds[0].round_time, last_time: rounds[rounds.length - 1].round_time,
    sorted: rounds.every((r, i) => i === 0 || rounds[i - 1].round_time < r.round_time),
  }),
);
