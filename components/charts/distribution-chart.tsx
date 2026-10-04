"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistogramBin } from "@/lib/stats";
import { axisProps, chart } from "./theme";
import { TooltipBox } from "./chart-tooltip";

export function DistributionChart({ bins, height = 260 }: { bins: HistogramBin[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Histogram of multipliers by range">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis dataKey="label" {...axisProps} interval={0} angle={-35} textAnchor="end" height={48} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={48} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as HistogramBin;
              return (
                <TooltipBox
                  title={b.label}
                  rows={[
                    { label: "Rounds", value: b.count.toLocaleString("en-US") },
                    { label: "Share", value: `${(b.share * 100).toFixed(1)}%`, color: chart.series1 },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="share" fill={chart.series1} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
