export function ConfusionMatrix({ cm, positiveLabel }: { cm: { tp: number; fp: number; tn: number; fn: number }; positiveLabel: string }) {
  const total = cm.tp + cm.fp + cm.tn + cm.fn || 1;
  const cell = (v: number, correct: boolean, title: string) => (
    <div
      className="relative flex flex-col items-center justify-center rounded-xl border border-line p-4"
      style={{ background: `rgba(57,135,229,${0.06 + (v / total) * 0.5})` }}
    >
      <span className="text-xl font-semibold text-ink tabular">{v.toLocaleString("en-US")}</span>
      <span className="mt-1 text-[10px] tracking-wide text-ink-2 uppercase">
        {title} · {correct ? "correct" : "wrong"}
      </span>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
      <div />
      <div className="pb-1 text-center text-ink-3">Predicted {positiveLabel}</div>
      <div className="pb-1 text-center text-ink-3">Predicted not</div>
      <div className="flex items-center pr-2 text-ink-3 [writing-mode:vertical-rl] rotate-180">Actual {positiveLabel}</div>
      {cell(cm.tp, true, "TP")}
      {cell(cm.fn, false, "FN")}
      <div className="flex items-center pr-2 text-ink-3 [writing-mode:vertical-rl] rotate-180">Actual not</div>
      {cell(cm.fp, false, "FP")}
      {cell(cm.tn, true, "TN")}
    </div>
  );
}
