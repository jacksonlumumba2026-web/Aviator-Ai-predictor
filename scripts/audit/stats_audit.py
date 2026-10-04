"""Cross-checks lib/stats.ts against SQL (Postgres) and numpy on the same stored rows.

Usage: python3 scripts/audit/stats_audit.py <ts-json-file> [demo|real]
"""
import json, subprocess, sys
import numpy as np

PSQL = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "aal", "-At", "-F", ","]
ts = json.load(open(sys.argv[1]))
demo = (sys.argv[2] if len(sys.argv) > 2 else "demo") == "demo"
W = f"is_demo = {str(demo).lower()}"


def sql(q):
    return subprocess.run(PSQL + ["-c", q], capture_output=True, text=True, check=True).stdout.strip()


rows = [l.split(",") for l in sql(f"select multiplier, to_char(round_time at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from aviator_rounds where {W} order by round_time").splitlines()]
x = np.array([float(r[0]) for r in rows])

agg = sql(f"""select count(*), avg(multiplier), percentile_cont(0.5) within group (order by multiplier),
  min(multiplier), max(multiplier), stddev_samp(multiplier),
  count(*) filter (where multiplier < 1.2), count(*) filter (where multiplier < 1.5), count(*) filter (where multiplier < 2),
  count(*) filter (where multiplier >= 1.5), count(*) filter (where multiplier >= 2), count(*) filter (where multiplier >= 3),
  count(*) filter (where multiplier >= 5), count(*) filter (where multiplier >= 10)
  from aviator_rounds where {W}""").split(",")
agg = [float(v) for v in agg]

edges = [1, 1.2, 1.5, 2, 3, 5, 10, 20, 50, 100]
hist_sql = sql(f"""select width_bucket(multiplier, array[{','.join(map(str, edges))}]::numeric[]) b, count(*)
  from aviator_rounds where {W} group by 1 order by 1""")
hist_sql_counts = [0] * len(edges)
for line in hist_sql.splitlines():
    b, c = map(int, line.split(","))
    hist_sql_counts[b - 1] = c

roll_sql = {}
for end in (50, 1000, len(x)):
    r = sql(f"""with o as (select multiplier, row_number() over (order by round_time) rn from aviator_rounds where {W})
      select avg(multiplier), stddev_samp(ln(multiplier)), percentile_cont(0.5) within group (order by multiplier)
      from o where rn between {end - 49} and {end}""").split(",")
    roll_sql[end] = [float(v) for v in r]

streak_sql = sql(f"""with o as (select multiplier < 2 low, row_number() over (order by round_time) rn from aviator_rounds where {W}),
  g as (select low, rn - row_number() over (partition by low order by rn) grp from o)
  select low, max(n) from (select low, grp, count(*) n from g group by 1, 2) s group by 1 order by 1""")
streak_sql = {l.split(",")[0]: int(l.split(",")[1]) for l in streak_sql.splitlines()}

# numpy independent implementation
def longest(mask):
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best

npv = {
    "count": len(x), "mean": x.mean(), "median": float(np.median(x)), "min": x.min(), "max": x.max(), "std": x.std(ddof=1),
}
checks = []
def chk(name, app, sql_v, np_v, tol=1e-9):
    ok = all(abs(app - v) <= tol * max(1, abs(v)) for v in (sql_v, np_v) if v is not None)
    checks.append((name, app, sql_v, np_v, ok))

chk("count", ts["count"], agg[0], npv["count"])
chk("mean", ts["mean"], agg[1], npv["mean"])
chk("median", ts["median"], agg[2], npv["median"])
chk("min", ts["min"], agg[3], npv["min"])
chk("max", ts["max"], agg[4], npv["max"])
chk("std (n-1)", ts["std"], agg[5], npv["std"])
for i, k in enumerate(["1.2x", "1.5x", "2x"]):
    chk(f"count below {k}", ts["below"][k], agg[6 + i], int((x < float(k[:-1])).sum()))
for i, k in enumerate(["1.5x", "2x", "3x", "5x", "10x"]):
    chk(f"count reaching {k}", ts["reaching"][k], agg[9 + i], int((x >= float(k[:-1])).sum()))
np_hist = np.histogram(x, bins=edges + [np.inf])[0]
for i, (a, b, c) in enumerate(zip(ts["histogram"], hist_sql_counts, np_hist)):
    chk(f"histogram bin {i} [{edges[i]}, {edges[i+1] if i+1 < len(edges) else 'inf'})", a, b, int(c))
for end, key in ((50, "50"), (1000, "1000"), (len(x), "3000")):
    w = x[end - 50:end]
    p = ts["rolling"][key]
    chk(f"rolling mean, rounds {end-49}..{end}", p["mean"], roll_sql[end][0], w.mean())
    chk(f"rolling median, rounds {end-49}..{end}", p["median"], roll_sql[end][2], float(np.median(w)))
    chk(f"rolling σ(log), rounds {end-49}..{end}", p["volatility"], roll_sql[end][1], np.log(w).std(ddof=1))
chk("longest streak < 2x", ts["streaks"]["longestBelow2x"], streak_sql.get("t"), longest(x < 2))
chk("longest streak >= 2x", ts["streaks"]["longestAtLeast2x"], streak_sql.get("f"), longest(x >= 2))
chk("longest streak < 1.5x", ts["streaks"]["longestBelow1_5x"], None, longest(x < 1.5))
cur = 0
for v in x[::-1]:
    if (v < 2) == (x[-1] < 2): cur += 1
    else: break
chk("current streak length", ts["streaks"]["current"]["length"], None, cur)
checks.append(("rows chronological (app)", ts["sorted"], "-", "-", ts["sorted"] is True))
checks.append(("first/last round_time", f'{ts["first_time"]} … {ts["last_time"]}', f"{rows[0][1]} … {rows[-1][1]}", "-",
               ts["first_time"] == rows[0][1] and ts["last_time"] == rows[-1][1]))

w = max(len(c[0]) for c in checks)
fmt = lambda v: f"{v:.10g}" if isinstance(v, (float, np.floating)) else str(v)
print(f"{'check':<{w}} | {'app (lib/stats.ts)':>22} | {'SQL (Postgres)':>22} | {'numpy':>18} | ok")
for name, a, b, c, ok in checks:
    print(f"{name:<{w}} | {fmt(a):>22} | {fmt(b):>22} | {fmt(c):>18} | {'PASS' if ok else 'FAIL'}")
fails = [c for c in checks if not c[4]]
print(f"\n{len(checks) - len(fails)}/{len(checks)} checks passed")
sys.exit(1 if fails else 0)
