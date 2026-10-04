/**
 * Generates the real-data validation report from stored data only.
 *
 *   node --conditions=react-server --import tsx scripts/reports/validation-report.mts real docs/REAL_DATA_VALIDATION_REPORT.md
 *   node --conditions=react-server --import tsx scripts/reports/validation-report.mts test docs/examples/TEST_DATA_PROTOCOL_DRY_RUN.md
 *
 * Nothing is invented: every number comes from the database / frozen protocol
 * record. Sections without data say so explicitly.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getRepository } from "@/services/repository";
import { qualityReport } from "@/lib/quality";
import type { Dataset, ValidationRun } from "@/types";

const dataset = (process.argv[2] ?? "real") as Dataset;
const out = process.argv[3] ?? "docs/REAL_DATA_VALIDATION_REPORT.md";
const ROOT = path.resolve(import.meta.dirname, "../..");
const NO_EDGE = "NO RELIABLE PREDICTIVE EDGE DETECTED.";
const THRESHOLDS = ["1.5x", "2x", "3x", "5x", "10x"];

const pct = (v: unknown, d = 1) => (typeof v === "number" ? `${(v * 100).toFixed(d)}%` : "—");
const num = (v: unknown, d = 3) => (typeof v === "number" ? v.toFixed(d) : "—");
const pv = (v: unknown) => (typeof v !== "number" ? "—" : v < 1e-4 ? "<0.0001" : v.toFixed(4));
const int = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : "—");
const git = (c: string) => {
  try {
    return execSync(c, { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
};

const repo = getRepository();
const [rounds, batches, runs] = await Promise.all([repo.allRounds({ dataset }), repo.listImportBatches(dataset), repo.listValidationRuns(dataset)]);
const frozen = JSON.parse(readFileSync(path.join(ROOT, "ml/aviator_ml/protocol/FROZEN_PROTOCOL.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(ROOT, "release/v0.2.0-audited/manifest.json"), "utf8"));
const final = runs.find((r) => r.stage === "final_test" && r.status === "completed") ?? null;
const conf = final ? (runs.find((r) => r.stage === "confirmation" && r.parent_run_id === final.id && r.status === "completed") ?? null) : null;
const q = rounds.length ? qualityReport(rounds) : null;
const ind = q?.independence ?? null;

const classification = conf?.classification ?? final?.classification ?? null;
const conclusion =
  classification === "STRONGER_SIGNAL"
    ? String((conf!.result as { conclusion: string }).conclusion)
    : final
      ? `${NO_EDGE}${classification === "PROMISING_SIGNAL" ? " (A promising final-test result has not been confirmed on a second window, so it is not robust.)" : ""}`
      : `${NO_EDGE} No validation window has been evaluated on this dataset, so no predictive advantage has been demonstrated.`;

const label = { real: "REAL DATA", demo: "DEMO DATA — NOT REAL GAME RESULTS", test: "TEST DATA — SYNTHETIC, NOT REAL GAME RESULTS" }[dataset];

function metricsTable(run: ValidationRun) {
  const r = run.result as {
    metrics: Record<string, Record<string, number | null | number[]>>;
    chosen_models: Record<string, string>;
    multiple_testing: { targets: Record<string, { brier_p: number; brier_p_holm: number; auc_p: number; auc_p_holm: number; passed: boolean; nominal_only: boolean }> };
    confirmation_family?: { family: string[]; targets: Record<string, { brier_p_holm: number; auc_p_holm: number; passed: boolean }> } | null;
  };
  const rows = THRESHOLDS.map((k) => {
    const m = r.metrics[k];
    const f = (r.confirmation_family?.targets[k] as typeof r.multiple_testing.targets[string] | undefined) ?? r.multiple_testing.targets[k];
    const ci = m.roc_auc_ci as number[] | null;
    const cal = (m.calibration as unknown as { count: number; mean_predicted: number | null; observed_rate: number | null }[])
      .filter((b) => b.count)
      .map((b) => `${pct(b.mean_predicted, 0)}→${pct(b.observed_rate, 0)} (${b.count})`)
      .join(", ");
    return {
      line: `| ≥${k} | ${r.chosen_models[k]} | ${int(m.n)} | ${pct(m.base_rate)} | ${pct(m.accuracy)} / ${pct(m.baseline_accuracy)} | ${num(m.roc_auc)} [${num(ci?.[0])}, ${num(ci?.[1])}] | ${num(m.brier, 4)} / ${num(m.baseline_brier, 4)} | ${m.precision === null ? "—" : pct(m.precision)} | ${pct(m.recall)} | ${num(m.f1)} | ${pct(m.ece, 2)} | ${pv(f.brier_p)} → ${pv(f.brier_p_holm)} | ${pv(f.auc_p)} → ${pv(f.auc_p_holm)} | ${f.passed ? "**passes**" : f.nominal_only ? "nominal only" : "no edge"} |`,
      cal: `- ≥${k}: ${cal || "—"}`,
    };
  });
  return [
    "| Target | Model | n | Base rate | Accuracy / baseline | ROC-AUC [95% CI] | Brier / baseline | Precision | Recall | F1 | ECE | Brier p → Holm | AUC p → Holm | Result |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((x) => x.line),
    "",
    "Calibration (mean predicted → observed rate, rounds per bin):",
    "",
    ...rows.map((x) => x.cal),
  ].join("\n");
}

const periods = final ? ((final.result as { periods: Record<string, [string, string, number]> }).periods) : null;
const md: string[] = [];
md.push(
  `# Real-Data Validation Report${dataset !== "real" ? ` — ${label}` : ""}`,
  "",
  `> **Dataset label: ${label}.**${dataset !== "real" ? " This report describes synthetic data used to test the protocol machinery. It says nothing about real game observations." : ""}`,
  "",
  `*Generated ${new Date().toISOString()} from commit \`${git("git rev-parse --short HEAD")}\` by \`scripts/reports/validation-report.mts\`. All figures are read from stored data.*`,
  "",
  "## Conclusion",
  "",
  `**${conclusion}**`,
  "",
  `Classification: **${(classification ?? "NOT EVALUATED").replace(/_/g, " ")}**`,
  "",
  "## 1. Data source",
  "",
  batches.length
    ? ["| Batch | Source | Method | Attested | Rows read | Inserted | Rejected | Period | Rows sha256 |", "|---|---|---|---|---|---|---|---|---|",
       ...batches.map((b) => `| \`${b.id.slice(0, 8)}\` | ${b.source_name} | ${b.collection_method} | ${b.attested ? "yes" : "no"} | ${int(b.total_rows)} | ${int(b.inserted_rows)} | ${int(b.rejected_rows)} | ${b.first_round_time?.slice(0, 19) ?? "—"} → ${b.last_round_time?.slice(0, 19) ?? "—"} | \`${b.rows_sha256?.slice(0, 16) ?? "—"}…\` |`),
       "", ...batches.map((b) => `- \`${b.id.slice(0, 8)}\` provenance: ${b.provenance_notes}`)].join("\n")
    : "No data has been imported into this dataset.",
  "",
  "## 2. Number of rounds",
  "",
  `${int(rounds.length)} stored rounds.`,
  "",
  "## 3. Collection period",
  "",
  q ? `${q.firstRoundTime} → ${q.lastRoundTime} (UTC).` : "—",
  "",
  "## 4. Data-quality results",
  "",
  q
    ? [
        `| Total | Unique | Duplicates skipped | Rejected rows | Time gaps | ≈ missing rounds | Median interval |`,
        `|---|---|---|---|---|---|---|`,
        `| ${int(q.totalRounds)} | ${int(q.uniqueRounds)} | ${int(batches.reduce((a, b) => a + b.duplicates_in_file + b.already_stored, 0))} | ${int(batches.reduce((a, b) => a + b.rejected_rows, 0))} | ${int(q.timeGaps.gapCount)} | ${int(q.timeGaps.estimatedMissingRounds)} | ${q.timeGaps.medianIntervalS?.toFixed(1) ?? "—"} s |`,
        "",
        `Min ${num(q.stats.min, 2)}x · max ${num(q.stats.max, 2)}x · mean ${num(q.stats.mean, 4)} · median ${num(q.stats.median, 2)} · σ ${num(q.stats.std, 4)}.`,
        "",
        `Threshold frequencies: ${THRESHOLDS.map((k) => `≥${k} ${pct(q.stats.reaching[k as "2x"].rate, 2)}`).join(" · ")}.`,
        "",
        `Distribution: ${q.stats.histogram.map((b) => `${b.label} ${int(b.count)}`).join(" · ")}.`,
      ].join("\n")
    : "—",
  "",
  "## 5. Independence tests",
  "",
  ind
    ? [
        `**${ind.dependenceDetected ? "Evidence of dependence" : "No evidence of dependence"}.** ${ind.summary}`,
        "",
        `**Exploitability:** ${ind.exploitability}`,
        "",
        "| Test | Statistic | Effect | p | p (Holm) |",
        "|---|---|---|---|---|",
        ...ind.tests.map((t) => `| ${t.name} | ${t.statistic} | ${t.effect} | ${pv(t.p)} | ${pv(t.pHolm)}${t.rejected ? " **rejected**" : ""} |`),
      ].join("\n")
    : "Not enough rounds for dependence diagnostics.",
  "",
  "## 6. Feature set",
  "",
  `${manifest.features.count} features, frozen since v0.2.0-audited: ${manifest.features.names.map((n: string) => `\`${n}\``).join(", ")}.`,
  "",
  "## 7. Models",
  "",
  `Candidates: ${manifest.model_versions.candidates.join(", ")} (fixed hyperparameters, \`ml/aviator_ml/models/registry.py\`). One model per target chosen on the validation window only.${final ? ` Chosen: ${Object.entries((final.result as { chosen_models: Record<string, string> }).chosen_models).map(([k, v]) => `≥${k} → ${v}`).join(", ")}.` : ""}`,
  "",
  "## 8. Baseline",
  "",
  "Training-window base rate for each target — the same information the model had. It predicts the majority class at the 50% threshold.",
  "",
  "## 9–11. Training, validation and final test periods",
  "",
  periods
    ? ["| Period | From | To | Rounds |", "|---|---|---|---|", ...Object.entries(periods).map(([k, [a, b, n]]) => `| ${k.replace("_", " ")} | ${a} | ${b} | ${int(n)} |`)].join("\n")
    : "Not evaluated — no final test window has been run.",
  "",
  "## 12. Test metrics",
  "",
  final ? metricsTable(final) : "Not evaluated.",
  "",
  "## 13. Multiple-testing correction",
  "",
  "Holm–Bonferroni across the five targets (family-wise α = 0.05), applied separately to the paired Brier-improvement test and the ROC-AUC > 0.5 test. A target counts as an edge only if **both** adjusted p-values are below 0.05 *and* Brier skill is positive (an intersection–union test). Three candidate models per target are compared only on the validation window; exactly one pre-selected model per target is evaluated on each test window, so model choice adds no test-set comparisons. In the confirmation window, the family is restricted to the targets that passed stage 1.",
  "",
  "## 14. First test-window result",
  "",
  final
    ? `Classification **${final.classification}**. Window ${final.window_start} → ${final.window_end}, ${int(final.window_rounds)} rounds, fingerprint \`${final.window_fingerprint}\`, data sha256 \`${final.data_sha256.slice(0, 16)}…\`, evaluated once at ${final.completed_at}.`
    : "Not evaluated.",
  "",
  "## 15. Second confirmation-window result",
  "",
  conf
    ? `Classification **${conf.classification}**. Window ${conf.window_start} → ${conf.window_end}, ${int(conf.window_rounds)} rounds collected after the final test window, fingerprint \`${conf.window_fingerprint}\`.\n\n${metricsTable(conf)}`
    : final
      ? "Not yet evaluated (needs ≥ 6,500 rounds collected after the final test window)."
      : "Not evaluated.",
  "",
  "## 16. Evidence for / against predictive signal",
  "",
  `- Sequential dependence in the data: ${ind ? (ind.dependenceDetected ? "detected (see §5) — which by itself does not imply exploitability" : "not detected (see §5)") : "not assessed"}.`,
  `- Out-of-sample, frozen-model evidence: ${final ? `${final.classification}${conf ? `, confirmation ${conf.classification}` : ", unconfirmed"}` : "none — not evaluated"}.`,
  `- Conclusion: **${conclusion}**`,
  "",
  "## 17. Limitations",
  "",
  "- Results apply only to this dataset and period; game parameters or data collection may change.",
  "- Missing rounds (time gaps, §4) make lag features span non-adjacent rounds.",
  "- Statistical predictability is not profitability: payouts, house edge and risk are not modelled, and nothing here is betting advice.",
  "- A significant dependence test with a tiny effect size can be practically meaningless.",
  "- Only the baseline model family was tested; no conclusion is drawn about other model classes (by design — complex models are not justified unless this baseline shows signal).",
  "",
  "## 18. Exact reproducibility instructions",
  "",
  "```bash",
  `git checkout ${git("git rev-parse HEAD")}`,
  "pip install -r ml/requirements.lock.txt && npm ci",
  "python3 scripts/freeze/manifest.py verify v0.2.0-audited      # methodology unchanged",
  "(cd ml && python -m pytest -q tests/test_protocol.py)          # protocol hash still frozen",
  "# restore the same rows (verify rows_sha256 per batch in §1), then via the app: Validation → evaluate.",
  `# Protocol ${frozen.protocol_version}, sha256 ${frozen.protocol_sha256}`,
  "```",
  "",
  `Data sha256 of the stage-1 snapshot: ${final ? `\`${final.data_sha256}\`` : "—"}. Each window can only be evaluated once per protocol hash; re-running requires a new protocol version and new, untouched data.`,
  "",
);

mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
writeFileSync(path.join(ROOT, out), md.join("\n"));
console.log(`wrote ${out} (${dataset}): ${conclusion}`);
