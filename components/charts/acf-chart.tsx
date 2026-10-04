"use client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, chart } from "./theme";
import { TooltipBox } from "./chart-tooltip";

/** Autocorrelation by lag with the ±1.96/√n band expected under independence. */
export function AcfChart({ points, band, label, height = 220 }: { points: { lag: number; r: number }[]; band: number; label: string; height?: number }) {
  const lim = Math.max(band * 2.2, ...points.map((p) => Math.abs(p.r) * 1.2));
  return (
    <div style={{ height }} role="img" aria-label={`${label} by lag with independence band`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis dataKey="lag" {...axisProps} interval={1} />
          <YAxis {...axisProps} width={52} domain={[-lim, lim]} tickFormatter={(v: number) => v.toFixed(3)} />
          <ReferenceLine y={band} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
          <ReferenceLine y={-band} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`Lag ${(payload[0].payload as { lag: number }).lag}`}
                  rows={[
                    { label, value: (payload[0].payload as { r: number }).r.toFixed(4), color: chart.series1 },
                    { label: "95% band", value: `±${band.toFixed(4)}` },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="r" fill={chart.series1} radius={[3, 3, 3, 3]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
