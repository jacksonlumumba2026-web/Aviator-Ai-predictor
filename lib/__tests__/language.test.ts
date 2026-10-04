import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The product reports probabilities and uncertainty. These phrases must never
// appear in user-facing code, except inside an explicit negation.
const FORBIDDEN = [/guaranteed prediction/i, /next multiplier/i, /winning signal/i, /safe bet/i, /guaranteed profit/i, /\bwill be \d+(\.\d+)?x/i, /sure win/i];
const ALLOWED_NEGATIONS = [/not a guaranteed prediction/i, /never output/i];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mts)$/.test(p) && !p.includes("__tests__") ? [p] : [];
  });
}

describe("no misleading certainty language in user-facing code", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  for (const f of ["app", "components", "lib", "services"].flatMap((d) => files(path.join(root, d)))) {
    it(path.relative(root, f), () => {
      const text = ALLOWED_NEGATIONS.reduce((t, re) => t.replace(new RegExp(re, "gi"), ""), readFileSync(f, "utf8"));
      for (const re of FORBIDDEN) expect(text, `${re} in ${f}`).not.toMatch(re);
    });
  }
});
