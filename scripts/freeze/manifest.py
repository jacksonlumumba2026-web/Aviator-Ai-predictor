"""Freeze manifest: records exactly what a frozen version contains, and verifies it.

    python3 scripts/freeze/manifest.py create <tag> [--audit-model <version>]   # writes release/<tag>/manifest.json
    python3 scripts/freeze/manifest.py verify <tag>                            # exit 1 if a frozen component changed

Hashes are computed from the files *at the tagged commit* (git show), so the
manifest describes the tag precisely, independent of the working tree.
"""
from __future__ import annotations

import hashlib, json, os, subprocess, sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Component -> files. A change to any file changes the component hash.
# METHODOLOGY components define the experiment and must not change after a freeze;
# application components are tracked for provenance but may evolve.
METHODOLOGY = {"feature_engineering", "model_architecture", "training_protocol", "evaluation_python", "evaluation_typescript"}
COMPONENTS = {
    "feature_engineering": ["ml/aviator_ml/features/engineering.py", "ml/aviator_ml/config.py"],
    "model_architecture": ["ml/aviator_ml/models/registry.py"],
    "training_protocol": ["ml/aviator_ml/training/experiment.py"],
    "evaluation_python": ["ml/aviator_ml/evaluation/metrics.py", "ml/aviator_ml/evaluation/backtest.py"],
    "evaluation_typescript": ["lib/evaluation.ts", "lib/stats.ts", "lib/constants.ts"],
    "ingestion_validation": ["lib/csv.ts", "lib/schemas.ts"],
}

FEATURE_DEFINITIONS = {
    "lag_log_k (k=1..10)": "ln(multiplier) of the round k positions before the target round",
    "mean_log_w / median_log_w / std_log_w (w=3,5,10,20)": "rolling mean / median / population std of ln(multiplier) over the previous w rounds",
    "n_below_1_2_w (w=10,20)": "count of previous w rounds with multiplier < 1.2",
    "n_at_least_2_w (w=10,20)": "count of previous w rounds with multiplier >= 2",
    "n_at_least_5_w (w=10,20)": "count of previous w rounds with multiplier >= 5",
    "volatility_ratio_5_20": "std_log_5 / (std_log_20 + 1e-9)",
    "max_log_20": "max ln(multiplier) over the previous 20 rounds",
    "streak_2x": "signed run length of the previous rounds relative to 2x (+k: k rounds >= 2x, -k: k rounds < 2x), clipped to +/-50",
}


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=True).stdout


def blob(commit: str, path: str) -> bytes:
    return subprocess.run(["git", "-C", ROOT, "show", f"{commit}:{path}"], capture_output=True, check=True).stdout


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def component_hashes(read) -> dict:
    out = {}
    for name, files in COMPONENTS.items():
        h = hashlib.sha256()
        per = {}
        for f in files:
            data = read(f)
            per[f] = sha(data)
            h.update(f.encode() + b"\0" + data + b"\0")
        out[name] = {"sha256": h.hexdigest(), "files": per}
    return out


def create(tag: str, audit_model: str | None) -> None:
    commit = git("rev-list", "-n", "1", tag).strip()
    migrations = sorted(p for p in git("ls-tree", "--name-only", f"{commit}:supabase/migrations").split() if p.endswith(".sql"))
    sys.path.insert(0, os.path.join(ROOT, "ml"))
    from aviator_ml.config import THRESHOLDS, TRAIN_FRACTION, VALIDATION_FRACTION, MIN_HISTORY, ALPHA  # noqa: E402
    from aviator_ml.features.engineering import feature_names  # noqa: E402

    manifest = {
        "tag": tag,
        "commit": commit,
        "commit_date": git("show", "-s", "--format=%cI", commit).strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_versions": {
            "audit_run": audit_model,
            "note": "Model artifacts are not committed. Training is deterministic (random_state=42); "
            "retraining this tag on the same rounds reproduces the audit predictions bit-for-bit (verified in the audit).",
            "candidates": ["logistic_regression", "random_forest", "gradient_boosting"],
        },
        "targets": [f">={k:g}x" for k in THRESHOLDS],
        "split": {"history_rows": MIN_HISTORY, "train": TRAIN_FRACTION, "validation": VALIDATION_FRACTION,
                  "test": round(1 - TRAIN_FRACTION - VALIDATION_FRACTION, 2), "order": "chronological, never shuffled"},
        "baseline": "training-window base rate (same information set as the model)",
        "significance": f"Brier paired z-test, Bonferroni alpha={ALPHA}/5, plus Hanley-McNeil ROC-AUC CI lower bound > 0.5",
        "features": {"count": len(feature_names()), "names": feature_names(), "definitions": FEATURE_DEFINITIONS},
        "database_schema": {
            "version": migrations[-1].split("_")[0] if migrations else None,
            "migrations": {m: sha(blob(commit, f"supabase/migrations/{m}")) for m in migrations},
        },
        "components": component_hashes(lambda p: blob(commit, p)),
        "methodology_components": sorted(METHODOLOGY),
        "python_lock": "ml/requirements.lock.txt",
    }
    out_dir = os.path.join(ROOT, "release", tag)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(f"wrote release/{tag}/manifest.json for {commit}")


def verify(tag: str) -> int:
    manifest = json.load(open(os.path.join(ROOT, "release", tag, "manifest.json")))
    current = component_hashes(lambda p: open(os.path.join(ROOT, p), "rb").read())
    changed = [n for n, v in manifest["components"].items() if current[n]["sha256"] != v["sha256"]]
    for n in manifest["components"]:
        kind = "methodology" if n in METHODOLOGY else "application"
        print(f"{'CHANGED ' if n in changed else 'frozen  '} {n:<24} ({kind})")
    broken = [n for n in changed if n in METHODOLOGY]
    if broken:
        print(f"\nMethodology changed since {tag}: {', '.join(broken)}. Results are NOT comparable to the frozen version.")
        return 1
    if changed:
        print(f"\nOnly application components changed; the experimental methodology still matches {tag}.")
        return 0
    print(f"\nAll components match {tag} ({manifest['commit'][:10]}).")
    return 0


if __name__ == "__main__":
    cmd, tag = sys.argv[1], sys.argv[2]
    if cmd == "create":
        model = sys.argv[sys.argv.index("--audit-model") + 1] if "--audit-model" in sys.argv else None
        create(tag, model)
    else:
        sys.exit(verify(tag))
