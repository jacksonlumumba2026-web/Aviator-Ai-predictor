import { Sparkles } from "lucide-react";
import { ESTIMATE_LABEL, THRESHOLDS } from "@/lib/constants";
import { probabilityOf } from "@/lib/evaluation";
import { dateTime, relativeTime } from "@/lib/format";
import type { NewPrediction, Prediction } from "@/types";
import { ProbabilityBars } from "../charts/probability-bars";
import { Card, CardBody, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ConfidenceBadge } from "./confidence-badge";
import { ActionButton } from "./action-button";

export function EstimateCard({
  prediction,
  canPredict,
  title = "Next-round analysis",
}: {
  prediction: Prediction | NewPrediction | null;
  canPredict: boolean;
  title?: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader
        eyebrow="Experimental estimate"
        title={title}
        action={prediction ? <ConfidenceBadge level={prediction.confidence} /> : null}
      />
      <CardBody>
        {prediction ? (
          <>
            <ProbabilityBars
              rows={THRESHOLDS.map((t) => ({
                label: t.label,
                value: probabilityOf(prediction as Prediction, t.key),
                reference: prediction.baseline?.[t.key],
              }))}
            />
            <div className="mt-6 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3 text-xs leading-relaxed text-warn">
              {ESTIMATE_LABEL} Probabilities are estimates of how often similar situations reached each level; they say nothing certain about the next round.
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-ink-3">Model</dt>
                <dd className="mt-0.5 truncate font-mono text-ink-2">{prediction.model_version}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Generated</dt>
                <dd className="mt-0.5 text-ink-2" title={dateTime(prediction.prediction_time)}>
                  {relativeTime(prediction.prediction_time)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-3">Uses rounds up to</dt>
                <dd className="mt-0.5 text-ink-2">{dateTime(prediction.based_on_round_time)}</dd>
              </div>
            </dl>
            {canPredict && (
              <div className="mt-6">
                <ActionButton url="/api/predictions/next" size="sm" pendingLabel="Estimating…">
                  <Sparkles className="size-3.5" /> Refresh estimate
                </ActionButton>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Sparkles />}
            title="No estimate yet"
            description="Estimates come only from a trained model. Train and backtest a model first; it will then produce probability estimates — never certainties."
            href="/models"
            cta="Go to Models"
          />
        )}
      </CardBody>
    </Card>
  );
}
