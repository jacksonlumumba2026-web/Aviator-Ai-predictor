import { dateTime, int } from "@/lib/format";

/** Visualises the chronological train → validation → test split. */
export function SplitTimeline({ splits }: { splits: Record<string, number | string> }) {
  const train = Number(splits.train);
  const val = Number(splits.validation);
  const test = Number(splits.test);
  const total = train + val + test || 1;
  const segs = [
    { label: "Train", n: train, cls: "bg-series-1", end: splits.train_end_time },
    { label: "Validation", n: val, cls: "bg-series-3", end: splits.validation_end_time },
    { label: "Test (walk-forward)", n: test, cls: "bg-series-2", end: splits.test_end_time },
  ];
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Chronological data split">
        {segs.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {segs.map((s) => (
          <div key={s.label} className="flex gap-3">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${s.cls}`} />
            <div className="text-xs">
              <p className="font-medium text-ink">
                {s.label} · {int(s.n)} rounds
              </p>
              <p className="mt-0.5 text-ink-3">ends {dateTime(String(s.end))}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Never shuffled. Models are selected on validation, then every test round is predicted using a model fit only on earlier rounds
        (refit every {String(splits.refit_every)} rounds on an expanding window). The first {String(splits.history_rows)} rounds only supply feature
        history.
      </p>
    </div>
  );
}
