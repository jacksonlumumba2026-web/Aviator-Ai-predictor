"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RollingPoint } from "@/lib/stats";
import { axisProps, chart } from "./theme";
import { TooltipBox } from "./chart-tooltip";

export function RollingChart({
  points,
  metric,
  window,
  color = chart.series1,
  height = 220,
}: {
  points: RollingPoint[];
  metric: "mean" | "median" | "volatility";
  window: number;
  color?: string;
  height?: number;
}) {
  const label = metric === "volatility" ? `σ(log x), ${window}-round` : `${window}-round rolling ${metric}`;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis dataKey="index" {...axisProps} tickFormatter={(v: number) => `#${v}`} minTickGap={40} />
          <YAxis {...axisProps} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => (metric === "volatility" ? v.toFixed(2) : `${v.toFixed(1)}x`)} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.2)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as RollingPoint;
              const v = p[metric];
              return (
                <TooltipBox
                  title={`Up to round #${p.index}`}
                  rows={[{ label, value: metric === "volatility" ? v.toFixed(3) : `${v.toFixed(2)}x`, color }]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey={metric} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
