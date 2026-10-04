"use client";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { CalibrationBin } from "@/lib/evaluation";
import { axisProps, chart } from "./theme";
import { TooltipBox } from "./chart-tooltip";

/** Reliability diagram: predicted probability vs observed frequency per bin. */
export function CalibrationChart({ bins, height = 300 }: { bins: CalibrationBin[]; height?: number }) {
  const data = bins.filter((b) => b.count > 0).map((b) => ({ x: b.mean_predicted!, y: b.observed_rate!, n: b.count, range: `${b.bin_lower.toFixed(1)}–${b.bin_upper.toFixed(1)}` }));
  return (
    <div style={{ height }} role="img" aria-label="Calibration chart: predicted probability versus observed frequency">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={chart.grid} />
          <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...axisProps} tickFormatter={(v: number) => `${v * 100}%`} name="Predicted" />
          <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...axisProps} width={44} tickFormatter={(v: number) => `${v * 100}%`} name="Observed" />
          <ZAxis type="number" dataKey="n" range={[60, 420]} />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
            stroke="rgba(255,255,255,0.28)"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{ value: "perfect calibration", fill: chart.axis, fontSize: 10, position: "insideTopLeft" }}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={`Bin ${d.range}`}
                  rows={[
                    { label: "Mean predicted", value: `${(d.x * 100).toFixed(1)}%`, color: chart.series1 },
                    { label: "Observed", value: `${(d.y * 100).toFixed(1)}%` },
                    { label: "Rounds", value: d.n.toLocaleString("en-US") },
                  ]}
                />
              );
            }}
          />
          <Scatter data={data} fill={chart.series1} fillOpacity={0.85} stroke={chart.surface} strokeWidth={2} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
