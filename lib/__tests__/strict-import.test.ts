import { describe, expect, it } from "vitest";
import { analyseStrict, canonicalRows, sha256Hex, timeGapAnalysis } from "../import/strict";
import { qualityReport } from "../quality";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const csv = (...rows: string[]) => ["multiplier,round_time", ...rows].join("\n");

describe("strict real-data validation", () => {
  it("accepts clean rows and normalises timezones to UTC", () => {
    const r = analyseStrict(csv("1.24,2026-10-04T13:00:01+03:00", "2.31,2026-10-04T10:00:18Z"), { now: NOW });
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.round_time)).toEqual(["2026-10-04T10:00:01.000Z", "2026-10-04T10:00:18.000Z"]);
    expect(r.clean).toBe(true);
  });

  it("rejects missing, malformed and impossible values with reasons", () => {
    const r = analyseStrict(
      csv(
        ",2026-10-04T10:00:01Z", // missing multiplier
        "1.50,", // missing timestamp
        "0.99,2026-10-04T10:00:03Z", // < 1
        "1.234,2026-10-04T10:00:04Z", // > 2 dp
        "2000000,2026-10-04T10:00:05Z", // > max
        "1.50,2026-10-04 10:00:06", // no timezone
        "1.50,2026-02-30T10:00:07Z", // not a real date
        "1.50,2099-01-01T00:00:00Z", // future
        "1.50,2015-01-01T00:00:00Z", // predates the game
        "1.50,04/10/2026 10:00", // wrong format
        "1.5,2026-10-04T10:00:10Z,extra", // malformed
      ),
      { now: NOW },
    );
    expect(r.rows).toHaveLength(0);
    const reasons = r.errors.map((e) => e.reason);
    expect(reasons).toEqual([
      "missing multiplier",
      "missing round_time",
      "impossible value: multiplier must be ≥ 1.00",
      "impossible precision: multipliers are reported to 2 decimal places",
      "impossible value: multiplier exceeds 1,000,000",
      "round_time has no timezone (append Z or an offset such as +03:00)",
      "round_time is not a real calendar time",
      "impossible value: round_time is in the future",
      "impossible value: round_time predates the game",
      "round_time must be ISO-8601 with seconds and timezone, e.g. 2026-10-04T10:00:01Z",
      "malformed row: expected 2 columns, found 3",
    ]);
    expect(r.clean).toBe(false);
  });

  it("separates exact duplicates from conflicting duplicates and drops conflicts", () => {
    const r = analyseStrict(
      csv("1.24,2026-10-04T10:00:01Z", "1.24,2026-10-04T13:00:01+03:00", "2.00,2026-10-04T10:00:20Z", "3.00,2026-10-04T10:00:20.000Z"),
      { now: NOW },
    );
    expect(r.duplicates).toHaveLength(1);
    expect(r.conflicts).toHaveLength(1);
    expect(r.rows.map((x) => x.multiplier)).toEqual([1.24]);
    expect(r.clean).toBe(false);
  });

  it("sorts and reports unsorted input", () => {
    const r = analyseStrict(csv("2.00,2026-10-04T10:00:20Z", "1.24,2026-10-04T10:00:01Z"), { now: NOW });
    expect(r.wasChronological).toBe(false);
    expect(r.rows[0].multiplier).toBe(1.24);
  });

  it("flags synthetic markers so they can never be imported as real", () => {
    expect(analyseStrict("# DEMO DATA — NOT REAL GAME RESULTS\n" + csv("1.5,2026-10-04T10:00:01Z"), { now: NOW }).syntheticMarkers).toHaveLength(1);
    expect(analyseStrict(csv("1.5,2026-10-04T10:00:01Z"), { now: NOW, fileName: "DEMO_DATA_NOT_REAL_rounds.csv" }).syntheticMarkers).toHaveLength(1);
    const exported = "multiplier,round_time,source,dataset\n1.50,2026-10-04T10:00:01.000Z,demo,demo\n";
    const r = analyseStrict(exported, { now: NOW });
    expect(r.syntheticMarkers[0]).toMatch(/labelled demo\/test/);
    expect(r.clean).toBe(false);
  });

  it("detects time gaps (missing rounds) and implausible intervals", () => {
    const t0 = Date.parse("2026-10-04T00:00:00Z");
    const times: string[] = [];
    for (let i = 0; i < 100; i++) times.push(new Date(t0 + i * 15_000).toISOString());
    times.push(new Date(t0 + 100 * 15_000 + 600_000).toISOString()); // 10-minute hole
    times.push(new Date(t0 + 100 * 15_000 + 600_500).toISOString()); // 0.5 s later
    const g = timeGapAnalysis(times);
    expect(g.medianIntervalS).toBe(15);
    expect(g.gapCount).toBe(1);
    expect(g.estimatedMissingRounds).toBe(40);
    expect(g.implausibleIntervals).toHaveLength(1);
  });

  it("checksums are content-based", async () => {
    const a = analyseStrict(csv("1.5,2026-10-04T13:00:01+03:00"), { now: NOW });
    const b = analyseStrict(csv("1.50,2026-10-04T10:00:01Z"), { now: NOW });
    expect(await sha256Hex(canonicalRows(a.rows))).toBe(await sha256Hex(canonicalRows(b.rows)));
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("quality report", () => {
  it("summarises a dataset", () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ multiplier: 1 + (i % 7), round_time: new Date(Date.UTC(2026, 9, 4) + i * 15000).toISOString() }));
    const q = qualityReport(rows);
    expect(q.uniqueRounds).toBe(300);
    expect(q.stats.min).toBe(1);
    expect(q.independence).not.toBeNull();
    expect(q.independence!.dependenceDetected).toBe(true); // a deterministic cycle is dependent
  });
});
