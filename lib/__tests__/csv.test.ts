import { describe, expect, it } from "vitest";
import { normaliseTime, parseRoundsCsv, roundsToCsv, splitCsvLine } from "../csv";

describe("parseRoundsCsv", () => {
  it("parses the documented example", () => {
    const r = parseRoundsCsv("multiplier,round_time\n1.24,2026-10-04T10:00:01Z\n2.31,2026-10-04T10:00:18Z\n1.05,2026-10-04T10:00:36Z\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.multiplier)).toEqual([1.24, 2.31, 1.05]);
    expect(r.rows[0].round_time).toBe("2026-10-04T10:00:01.000Z");
  });

  it("rejects multipliers below 1 and malformed rows with line numbers", () => {
    const r = parseRoundsCsv(
      ["multiplier,round_time", "0.99,2026-10-04T10:00:01Z", "abc,2026-10-04T10:00:02Z", "1.5,not-a-date", "1.5", "-2,2026-10-04T10:00:05Z", "1.50,2026-10-04T10:00:06Z"].join("\n"),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(r.errors[0].reason).toMatch(/≥ 1/);
  });

  it("detects duplicates and sorts chronologically", () => {
    const r = parseRoundsCsv(
      "round_time,multiplier\n2026-10-04T10:00:18Z,2.31\n2026-10-04T10:00:01Z,1.24\n2026-10-04T10:00:18+00:00,2.31\n",
    );
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0].line).toBe(4);
    expect(r.rows.map((x) => x.multiplier)).toEqual([1.24, 2.31]);
    expect(r.warnings.join(" ")).toMatch(/sorted/);
  });

  it("requires the header", () => {
    expect(parseRoundsCsv("a,b\n1,2").errors[0].reason).toMatch(/header/);
    expect(parseRoundsCsv("").errors[0].reason).toMatch(/empty/);
  });

  it("accepts an 'x' suffix and assumes UTC without a zone", () => {
    const r = parseRoundsCsv("multiplier,round_time\n2.5x,2026-10-04 10:00:00\n");
    expect(r.rows[0]).toMatchObject({ multiplier: 2.5, round_time: "2026-10-04T10:00:00.000Z" });
    expect(r.warnings.join(" ")).toMatch(/UTC/);
  });

  it("round-trips through export", () => {
    const csv = roundsToCsv([{ multiplier: 1.5, round_time: "2026-10-04T10:00:00.000Z", source: "a,b", is_demo: false }]);
    const r = parseRoundsCsv(csv);
    expect(r.rows[0].multiplier).toBe(1.5);
  });
});

describe("helpers", () => {
  it("splits quoted fields", () => {
    expect(splitCsvLine('1.2,"a, ""b""",x')).toEqual(["1.2", 'a, "b"', "x"]);
  });
  it("rejects nonsense timestamps", () => {
    expect(normaliseTime("2026-13-45T99:00:00Z")).toBeNull();
    expect(normaliseTime("yesterday")).toBeNull();
  });
});

describe("comments", () => {
  it("skips '#' comment lines such as the demo export banner", () => {
    const r = parseRoundsCsv("# DEMO DATA — NOT REAL GAME RESULTS\nmultiplier,round_time,source,is_demo\n1.50,2026-10-04T10:00:00.000Z,demo,true\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});
