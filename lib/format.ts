export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits);

export const mult = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(2)}x`);

export const int = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US"));

export const signedPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)} pp`;

export function pValue(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  if (p < 0.0001) return "< 0.0001";
  return p.toFixed(4);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const modelLabel = (name: string) =>
  ({
    logistic_regression: "Logistic Regression",
    random_forest: "Random Forest",
    gradient_boosting: "Gradient Boosting",
    xgboost: "XGBoost",
    base_rate: "Base rate",
  })[name] ?? name;
