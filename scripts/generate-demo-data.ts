/**
 * Writes data/demo/DEMO_DATA_NOT_REAL_rounds.csv
 * DEMO DATA — NOT REAL GAME RESULTS. For development and testing only.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { generateDemoRounds } from "../lib/demo";

const rows = generateDemoRounds();
const out = path.join(__dirname, "..", "data", "demo", "DEMO_DATA_NOT_REAL_rounds.csv");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, ["multiplier,round_time", ...rows.map((r) => `${r.multiplier.toFixed(2)},${r.round_time}`)].join("\n") + "\n");
console.log(`Wrote ${rows.length} DEMO rounds (NOT REAL GAME RESULTS) to ${out}`);
